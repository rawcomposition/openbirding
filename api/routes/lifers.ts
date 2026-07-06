import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "kysely";
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
  const regionNames = await getRegionNames().catch(() => new Map<string, string>());

  return c.json({
    items: items.map((it) => ({ ...it, regionName: regionNameFor(it.regionCode, regionNames) })),
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

// Grid: lifer count for every H3 cell of a resolution inside a viewport bbox.
// This is the always-on choropleth; the user's frequency/checklist filters do
// NOT apply here (they scope hotspot results only). Called on every settled
// pan/zoom, so it stays lean: no region-name enrichment, no citation.
lifersRoute.post("/grid", async (c) => {
  const startTime = performance.now();
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });

  const speciesInputs = parseSpeciesInput(body.species);
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
  const speciesInputs = parseSpeciesInput(body.species);
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
  const speciesInputs = parseSpeciesInput(body.species);
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

// Bounding box over a region's hotspots, for framing the map on selection.
lifersRoute.post("/region-bounds", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });
  if (!body.region) {
    throw new HTTPException(400, { message: "region is required" });
  }
  const regionCodes = parseRegionCodes(String(body.region));
  const index = await getLifersIndex();
  return c.json({ bbox: index.regionBounds(regionCodes) });
});

// Hot Zones: H3 hexagons ranked by how many new species you could find there.
lifersRoute.post("/zones", async (c) => {
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
  await ensureZonesLoaded(index);
  const { ids: seenIds, matched, unmatched } = index.resolveSpecies(speciesInputs);
  const bucket = index.bucketForFrequency(frequency);

  const items = index.queryZones({ seenIds, bucket, minChecklists, regionCodes, bbox, limit });
  const regionNames = await getRegionNames().catch(() => new Map<string, string>());

  return c.json({
    items: items.map((it) => ({ ...it, regionName: regionNameFor(it.regionCode, regionNames) })),
    meta: {
      seenMatched: matched,
      seenUnmatched: unmatched.length,
      frequency: index.buckets[bucket],
      frequencyPct: Math.round(index.buckets[bucket] * 100 * 10) / 10,
      minChecklists: Math.max(minChecklists, index.minChecklistsFloor),
      version: `${index.versionMonth} ${index.versionYear}`,
    },
    citation: await withTargetsDb((db) => getEbdCitation(db)).catch(() => undefined),
    queryTime: `${Math.round(performance.now() - startTime)} ms`,
  });
});

// Detail: which new species you'd get in one H3 zone, most-likely first.
lifersRoute.post("/zone/:cellRef", async (c) => {
  const startTime = performance.now();
  const cellRef = Number(c.req.param("cellRef"));
  if (!Number.isInteger(cellRef) || cellRef < 0) {
    throw new HTTPException(400, { message: "cellRef must be a non-negative integer" });
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

  const result = await withTargetsDb(async (db) => {
    const samplesRow = await sql<{ samples: number }>`
      SELECT SUM(samples) AS samples FROM h3_cell_samples WHERE cell_ref = ${cellRef}
    `.execute(db);
    const samples = samplesRow.rows[0]?.samples ?? 0;
    if (!samples) return { samples: 0, rows: [] as any[] };

    const rows = await sql<{
      id: number;
      code: string;
      name: string;
      sciName: string;
      taxonOrder: number;
      obs: number;
    }>`
      SELECT s.id AS id, s.code AS code, s.name AS name, s.sci_name AS sciName,
             s.taxon_order AS taxonOrder, SUM(o.obs) AS obs
      FROM h3_cell_obs o
      JOIN species s ON s.id = o.species_id
      WHERE o.cell_ref = ${cellRef}
      GROUP BY o.species_id
    `.execute(db);
    return { samples, rows: rows.rows };
  });

  const lifers = result.rows
    .map((r) => ({ ...r, frequency: r.obs / result.samples }))
    .filter((r) => r.frequency >= threshold && !seenIds.has(r.id))
    .map((r) => ({
      code: r.code,
      name: r.name,
      sciName: r.sciName,
      score: Math.round(r.frequency * 1000) / 10,
      taxonOrder: r.taxonOrder,
    }))
    .sort((a, b) => b.score - a.score || a.taxonOrder - b.taxonOrder);

  return c.json({
    cellRef,
    checklists: result.samples,
    lifers,
    liferCount: lifers.length,
    frequency: threshold,
    queryTime: `${Math.round(performance.now() - startTime)} ms`,
  });
});

export default lifersRoute;
