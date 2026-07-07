import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db, withTargetsDb } from "../db/index.js";
import { getEbdCitation } from "../lib/ebird.js";
import {
  getLifersIndex,
  lifersIndexStatus,
  warmLifersIndex,
  type LifersIndex,
  type SpeciesInput,
} from "../lib/lifers-index.js";
import { isLocationId, parseBBoxBody, parseRegionCodes } from "./targets-validators.js";

const lifersRoute = new Hono();

// The zone (H3) dataset is large, so it is loaded into memory the first time a
// zone query arrives (guarded so concurrent requests share one load).
let zonesReady: Promise<void> | null = null;
function ensureZonesLoaded(index: LifersIndex): Promise<void> {
  if (index.zonesLoaded) return Promise.resolve();
  if (!zonesReady) {
    zonesReady = new Promise<void>((resolve, reject) => {
      setImmediate(() => {
        try {
          const start = Date.now();
          index.loadZones();
          console.log(`Lifers zone index loaded in ${Date.now() - start} ms`);
          resolve();
        } catch (err) {
          zonesReady = null;
          reject(err);
        }
      });
    });
  }
  return zonesReady;
}

const MAX_SPECIES = 40000; // generous cap for large world life lists
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// Begin loading the in-memory index as soon as this module is mounted, then
// warm the (larger) zone dataset in the background so users never wait for it.
warmLifersIndex();
getLifersIndex()
  .then((index) => ensureZonesLoaded(index))
  .catch(() => {});

// Region code -> human-readable name ("PE-MDD" -> "Madre de Dios, Peru"),
// loaded once from the regions table.
let regionNamesPromise: Promise<Map<string, string>> | null = null;
function getRegionNames(): Promise<Map<string, string>> {
  if (!regionNamesPromise) {
    regionNamesPromise = db
      .selectFrom("regions")
      .select(["id", "name", "longName"])
      .execute()
      .then((rows) => {
        const map = new Map<string, string>();
        for (const r of rows) map.set(r.id, r.longName ?? r.name);
        return map;
      })
      .catch((err) => {
        regionNamesPromise = null;
        throw err;
      });
  }
  return regionNamesPromise;
}

/** Resolve a region code to a name, walking up the hierarchy (BR-MT-003 -> BR-MT -> BR). */
function regionNameFor(code: string, names: Map<string, string>): string | null {
  let c = code;
  while (c) {
    const hit = names.get(c);
    if (hit) return hit;
    const i = c.lastIndexOf("-");
    if (i < 0) return null;
    c = c.slice(0, i);
  }
  return null;
}

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

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parseToken(value: unknown): string {
  if (typeof value !== "string" || !TOKEN_RE.test(value)) {
    throw new HTTPException(400, { message: "listToken must be a UUID" });
  }
  return value;
}

/**
 * Species inputs for a query: either a stored life list referenced by
 * `listToken` (the normal path — the client uploads once via POST /list and
 * sends the ~40-byte token on every query instead of the full ~100 KB list),
 * or an inline `species` array.
 */
async function speciesInputsFor(body: Record<string, unknown>): Promise<SpeciesInput[]> {
  if (body.listToken != null) {
    const token = parseToken(body.listToken);
    const row = await db
      .selectFrom("lifeLists")
      .select(["species"])
      .where("token", "=", token)
      .executeTakeFirst();
    if (!row) {
      throw new HTTPException(404, { message: "Life list not found — please upload it again" });
    }
    return parseSpeciesInput(JSON.parse(row.species));
  }
  return parseSpeciesInput(body.species);
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

function parseResolution(value: unknown, allowed: number[]): number {
  const n = Number(value);
  if (!Number.isInteger(n) || !allowed.includes(n)) {
    throw new HTTPException(400, { message: `resolution must be one of ${allowed.join(", ")}` });
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
      zonesLoaded: index.zonesLoaded,
      resolutions: index.resolutions,
    });
  } catch (err) {
    return c.json({ ready: false, available: true, error: err instanceof Error ? err.message : String(err) });
  }
});

// Store (or replace) a life list server-side under an anonymous token the
// client keeps in localStorage, so revisits restore instantly and queries send
// a tiny token instead of the full species payload.
lifersRoute.post("/list", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });
  const speciesInputs = parseSpeciesInput(body.species); // /list stores a real list, never a token
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 200) : null;

  const index = await getLifersIndex();
  const { matched, unmatched } = index.resolveSpecies(speciesInputs);

  const species = JSON.stringify(speciesInputs);
  const speciesCount = speciesInputs.length;

  // Reuse the caller's token when it still exists (a "Replace" keeps the same
  // identity); otherwise mint a fresh one.
  let token = typeof body.token === "string" && TOKEN_RE.test(body.token) ? body.token : null;
  if (token) {
    const res = await db
      .updateTable("lifeLists")
      .set({ species, fileName, speciesCount, updatedAt: new Date().toISOString() })
      .where("token", "=", token)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) token = null;
  }
  if (!token) {
    token = randomUUID();
    await db.insertInto("lifeLists").values({ token, species, fileName, speciesCount }).execute();
  }

  return c.json({ token, count: speciesCount, matched, unmatchedCount: unmatched.length });
});

// Metadata for a stored list — lets a returning client confirm its token is
// still valid (404 => prompt a re-upload).
lifersRoute.get("/list/:token", async (c) => {
  const token = parseToken(c.req.param("token"));
  const row = await db
    .selectFrom("lifeLists")
    .select(["fileName", "speciesCount", "createdAt", "updatedAt"])
    .where("token", "=", token)
    .executeTakeFirst();
  if (!row) throw new HTTPException(404, { message: "Life list not found" });
  return c.json({ token, ...row });
});

lifersRoute.delete("/list/:token", async (c) => {
  const token = parseToken(c.req.param("token"));
  await db.deleteFrom("lifeLists").where("token", "=", token).execute();
  return c.json({ ok: true });
});

lifersRoute.post("/hotspots", async (c) => {
  const startTime = performance.now();
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });

  const speciesInputs = await speciesInputsFor(body);
  const frequency = parseFrequency(body.frequency);
  const minChecklists = parseMinChecklists(body.minChecklists);
  const limit = parseLimit(body.limit);
  const regionCodes = body.region ? parseRegionCodes(String(body.region)) : null;
  const bbox = parseBBoxBody(body.bbox);

  const index = await getLifersIndex();
  const { ids: seenIds, matched, unmatched } = index.resolveSpecies(speciesInputs);
  const bucket = index.bucketForFrequency(frequency);

  const { items, candidates } = index.queryHotspots({ seenIds, bucket, minChecklists, regionCodes, bbox, limit });
  const regionNames = await getRegionNames().catch(() => new Map<string, string>());

  return c.json({
    items: items.map((it) => ({ ...it, regionName: regionNameFor(it.regionCode, regionNames) })),
    meta: {
      // Hotspots in scope before frequency/checklist filtering — 0 means the
      // area simply has no eBird hotspots, so relaxing filters won't help.
      hotspotsInScope: candidates,
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
  const speciesInputs = await speciesInputsFor(body);
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

// Grid: lifer count for every H3 cell of a resolution inside a viewport bbox.
// This is the always-on choropleth; the user's frequency/checklist filters do
// NOT apply here (they scope hotspot results only). Called on every settled
// pan/zoom, so it stays lean: no region-name enrichment, no citation.
lifersRoute.post("/grid", async (c) => {
  const startTime = performance.now();
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });

  const speciesInputs = await speciesInputsFor(body);
  const bbox = parseBBoxBody(body.bbox);
  if (!bbox) {
    throw new HTTPException(400, { message: "bbox is required for grid queries" });
  }

  const index = await getLifersIndex();
  await ensureZonesLoaded(index);
  const resolution = parseResolution(body.resolution, index.resolutions);
  const { ids: seenIds } = index.resolveSpecies(speciesInputs);
  const { cells, maxLifers } = index.gridCells(seenIds, resolution, bbox);

  return c.json({
    resolution,
    cells,
    maxLifers,
    queryTime: `${Math.round(performance.now() - startTime)} ms`,
  });
});

// Worldwide quantile breakpoints per resolution — the fixed colour scale for
// this life list, fetched once so panning never recolours the grid and the full
// colour spectrum is spread across the real distribution of lifer counts.
lifersRoute.post("/grid-scale", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });
  const speciesInputs = await speciesInputsFor(body);
  const index = await getLifersIndex();
  await ensureZonesLoaded(index);
  const { ids: seenIds } = index.resolveSpecies(speciesInputs);
  return c.json({ breaksByRes: index.gridQuantiles(seenIds) });
});

// Per-cell detail for selected hexes: checklist samples, species, lifers.
lifersRoute.post("/cells", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });
  const speciesInputs = await speciesInputsFor(body);
  if (!Array.isArray(body.cells) || body.cells.length === 0 || body.cells.length > 500) {
    throw new HTTPException(400, { message: "cells must be a non-empty array of at most 500 h3 strings" });
  }
  const cells = body.cells.map((h: unknown) => {
    if (typeof h !== "string" || !/^[0-9a-f]{15}$/.test(h)) {
      throw new HTTPException(400, { message: "each cell must be a 15-char hex h3 index" });
    }
    return h;
  });

  const index = await getLifersIndex();
  await ensureZonesLoaded(index);
  const resolution = parseResolution(body.resolution, index.resolutions);
  const { ids: seenIds } = index.resolveSpecies(speciesInputs);
  return c.json({ resolution, cells: index.cellsInfo(seenIds, resolution, cells) });
});

export default lifersRoute;
