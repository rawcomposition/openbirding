import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { withTargetsDb } from "../db/index.js";
import { getEbdCitation } from "../lib/ebird.js";
import {
  getLifersIndex,
  lifersIndexStatus,
  warmLifersIndex,
  type SpeciesInput,
} from "../lib/lifers-index.js";
import { isLocationId, parseBBoxBody, parseRegionCodes } from "./targets-validators.js";

const lifersRoute = new Hono();

const MAX_SPECIES = 40000; // generous cap for large world life lists
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Begin loading the in-memory index as soon as this module is mounted.
warmLifersIndex();

function parseSpeciesInput(value: unknown): SpeciesInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HTTPException(400, {
      message: "species must be a non-empty array of { sciName, commonName, code }",
    });
  }
  if (value.length > MAX_SPECIES) {
    throw new HTTPException(400, { message: `species cannot contain more than ${MAX_SPECIES} entries` });
  }
  return value.map((item) => {
    if (typeof item === "string") return { sciName: item };
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      return {
        sciName: typeof o.sciName === "string" ? o.sciName : null,
        commonName: typeof o.commonName === "string" ? o.commonName : null,
        code: typeof o.code === "string" ? o.code : null,
      };
    }
    throw new HTTPException(400, { message: "each species entry must be a string or object" });
  });
}

/** Accepts frequency as a fraction (0-1) or a percent (>1); returns a fraction. */
function parseFrequency(value: unknown): number {
  if (value == null) return 0.05;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) {
    throw new HTTPException(400, { message: "frequency must be a non-negative number" });
  }
  return n > 1 ? n / 100 : n;
}

function parseMinChecklists(value: unknown): number {
  if (value == null) return 30;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new HTTPException(400, { message: "minChecklists must be a positive integer" });
  }
  return n;
}

function parseLimit(value: unknown): number {
  if (value == null) return DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
    throw new HTTPException(400, { message: `limit must be an integer between 1 and ${MAX_LIMIT}` });
  }
  return n;
}

lifersRoute.get("/status", async (c) => {
  const status = lifersIndexStatus();
  if (!status.available) {
    return c.json({ ready: false, available: false, error: status.error });
  }
  try {
    const index = await getLifersIndex();
    return c.json({
      ready: true,
      available: true,
      buckets: index.buckets,
      minChecklistsFloor: index.minChecklistsFloor,
      version: `${index.versionMonth} ${index.versionYear}`,
      locations: index.numLocs,
    });
  } catch (err) {
    return c.json({ ready: false, available: true, error: err instanceof Error ? err.message : String(err) });
  }
});

lifersRoute.post("/hotspots", async (c) => {
  const startTime = performance.now();
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });

  const speciesInputs = parseSpeciesInput(body.species);
  const frequency = parseFrequency(body.frequency);
  const minChecklists = parseMinChecklists(body.minChecklists);
  const limit = parseLimit(body.limit);
  const regionCodes = body.region ? parseRegionCodes(String(body.region)) : null;
  const bbox = parseBBoxBody(body.bbox);

  const index = await getLifersIndex();
  const { ids: seenIds, matched, unmatched } = index.resolveSpecies(speciesInputs);
  const bucket = index.bucketForFrequency(frequency);

  const items = index.queryHotspots({ seenIds, bucket, minChecklists, regionCodes, bbox, limit });

  return c.json({
    items,
    meta: {
      seenMatched: matched,
      seenUnmatched: unmatched.length,
      unmatchedSample: unmatched.slice(0, 25),
      frequency: index.buckets[bucket],
      frequencyPct: Math.round(index.buckets[bucket] * 100 * 10) / 10,
      minChecklists: Math.max(minChecklists, index.minChecklistsFloor),
      version: `${index.versionMonth} ${index.versionYear}`,
    },
    citation: await withTargetsDb((db) => getEbdCitation(db)).catch(() => undefined),
    queryTime: `${Math.round(performance.now() - startTime)} ms`,
  });
});

// Detail: which specific new species you'd get at one hotspot, most-likely first.
lifersRoute.post("/hotspot/:locationId", async (c) => {
  const startTime = performance.now();
  const locationId = c.req.param("locationId").trim().toUpperCase();
  if (!isLocationId(locationId)) {
    throw new HTTPException(400, { message: "locationId must look like L12345" });
  }
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });
  const speciesInputs = parseSpeciesInput(body.species);
  const frequency = parseFrequency(body.frequency);

  const index = await getLifersIndex();
  const { ids: seenIds } = index.resolveSpecies(speciesInputs);
  const bucket = index.bucketForFrequency(frequency);
  const threshold = index.buckets[bucket];

  const rows = await withTargetsDb((db) =>
    db
      .selectFrom("yearObs")
      .innerJoin("species", "species.id", "yearObs.speciesId")
      .where("yearObs.locationId", "=", locationId)
      .where("yearObs.score", ">=", threshold)
      .select([
        "species.id as id",
        "species.code as code",
        "species.name as name",
        "species.sciName as sciName",
        "species.taxonOrder as taxonOrder",
        "yearObs.obs as obs",
        "yearObs.samples as samples",
        "yearObs.score as score",
      ])
      .execute()
  );

  const lifers = rows
    .filter((r) => !seenIds.has(r.id))
    .map((r) => ({
      code: r.code,
      name: r.name,
      sciName: r.sciName,
      frequency: Math.round((r.obs / r.samples) * 1000) / 10,
      score: Math.round(r.score * 1000) / 10,
      taxonOrder: r.taxonOrder,
    }))
    .sort((a, b) => b.score - a.score || a.taxonOrder - b.taxonOrder);

  return c.json({
    locationId,
    lifers,
    liferCount: lifers.length,
    frequency: threshold,
    queryTime: `${Math.round(performance.now() - startTime)} ms`,
  });
});

export default lifersRoute;
