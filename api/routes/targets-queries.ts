import { HTTPException } from "hono/http-exception";
import { sql } from "kysely";
import { db, type TargetsDb } from "../db/index.js";
import { getEbdCitation } from "../lib/ebird.js";
import { parseRegionCodes } from "./targets-validators.js";

type HotspotsRequestOptions = {
  speciesCode: string;
  region: string | null;
  limit: number;
  month: number | null;
  minObservations: number | null;
  bbox: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } | null;
  locationIds: string[] | null;
};

export function roundFrequency(pct: number): number {
  if (pct >= 1) return Math.round(pct);
  if (pct >= 0.1) return Math.round(pct * 10) / 10;
  return Math.round(pct * 100) / 100;
}

function buildRegionConditions(regionCodes: string[]) {
  return sql.join(
    regionCodes.map((code) => sql`(code = ${code} OR code LIKE ${code + "-%"})`),
    sql` OR `
  );
}

export async function executeHotspotsQuery(targetsDb: TargetsDb, options: HotspotsRequestOptions) {
  const startTime = performance.now();

  const species = await targetsDb
    .selectFrom("species")
    .select("id")
    .where("code", "=", options.speciesCode.toLowerCase())
    .executeTakeFirst();

  if (!species) {
    throw new HTTPException(404, { message: "Species not found" });
  }

  const obsTable = options.month != null ? "monthObs" : "yearObs";

  let query = targetsDb
    .selectFrom(obsTable)
    .innerJoin("hotspots", `${obsTable}.locationId`, "hotspots.id")
    .where(`${obsTable}.speciesId`, "=", species.id)
    .select([
      "hotspots.id",
      "hotspots.name",
      "hotspots.countryCode",
      "hotspots.subnational1Code",
      "hotspots.lat",
      "hotspots.lng",
      `${obsTable}.obs`,
      `${obsTable}.samples`,
      `${obsTable}.score`,
    ])
    .orderBy("score", "desc")
    .limit(options.limit);

  if (options.month != null) {
    query = query.where("monthObs.month", "=", options.month);
  }

  if (options.minObservations != null) {
    query = query.where(`${obsTable}.obs`, ">=", options.minObservations);
  }

  if (options.region) {
    query = query.where("hotspots.regionCode", "like", `${options.region}%`);
  }

  if (options.locationIds) {
    query = query.where("hotspots.id", "in", options.locationIds);
  }

  if (options.bbox) {
    query = query
      .where("hotspots.lat", ">=", options.bbox.minLat)
      .where("hotspots.lat", "<=", options.bbox.maxLat)
      .where("hotspots.lng", ">=", options.bbox.minLng)
      .where("hotspots.lng", "<=", options.bbox.maxLng);
  }

  const rows = await query.execute();

  let regionMap = new Map<string, string | null>();
  if (!options.region) {
    const regionCodes = [...new Set(rows.flatMap((row) => [row.countryCode, row.subnational1Code]))];
    const regions = await db
      .selectFrom("regions")
      .select(["id", "longName"])
      .where("id", "in", regionCodes)
      .execute();
    regionMap = new Map(regions.map((r) => [r.id, r.longName]));
  }

  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    region: regionMap.get(row.subnational1Code) || regionMap.get(row.countryCode) || null,
    lat: row.lat,
    lng: row.lng,
    score: Math.round(row.score * 1000) / 10,
    frequency: Math.round((row.obs / row.samples) * 1000) / 10,
    samples: row.samples,
  }));

  const queryTime = Math.round(performance.now() - startTime);
  return { items, citation: await getEbdCitation(targetsDb), queryTime: `${queryTime} ms` };
}

export async function executeRegionTargetsQuery(targetsDb: TargetsDb, regionCode: string, months: number[] | null) {
  const startTime = performance.now();
  const regionCodes = parseRegionCodes(regionCode);
  const regionConditions = buildRegionConditions(regionCodes);
  const regionIdSubquery = sql`SELECT id FROM regions WHERE ${regionConditions}`;
  const monthList = months ? sql.join(months.map((m) => sql`${m}`), sql`, `) : null;
  const obsExpr = monthList
    ? sql`SUM(CASE WHEN rmo.month IN (${monthList}) THEN rmo.obs ELSE 0 END)`
    : sql`SUM(rmo.obs)`;
  const samplesExpr = monthList
    ? sql`SUM(CASE WHEN rms.month IN (${monthList}) THEN rms.samples ELSE 0 END)`
    : sql`SUM(rms.samples)`;

  const [speciesResult, totalsResult] = await Promise.all([
    sql<{ code: string; name: string; obs: number; samples: number }>`
      SELECT
        s.code,
        s.name,
        ${obsExpr} AS obs,
        ${samplesExpr} AS samples
      FROM region_month_obs rmo
      JOIN region_month_samples rms ON rms.region_id = rmo.region_id AND rms.month = rmo.month
      JOIN species s ON s.id = rmo.species_id
      WHERE rmo.region_id IN (${regionIdSubquery})
      GROUP BY rmo.species_id
      HAVING ${obsExpr} > 0
      ORDER BY (${obsExpr} * 1.0 / ${samplesExpr}) DESC, ${obsExpr} DESC, s.taxon_order ASC
    `.execute(targetsDb),

    sql<{ samples: number }>`
      SELECT
        ${monthList
          ? sql`SUM(CASE WHEN month IN (${monthList}) THEN samples ELSE 0 END)`
          : sql`SUM(samples)`} AS samples
      FROM region_month_samples
      WHERE region_id IN (${regionIdSubquery})
    `.execute(targetsDb),
  ]);

  const totals = totalsResult.rows[0];
  const queryTime = Math.round(performance.now() - startTime);
  return {
    items: speciesResult.rows.map((row) => ({
      name: row.name,
      code: row.code,
      frequency: roundFrequency((row.obs / row.samples) * 100),
    })),
    samples: totals?.samples ?? 0,
    citation: await getEbdCitation(targetsDb),
    queryTime: `${queryTime} ms`,
  };
}

export async function executeLocationTargetsQuery(targetsDb: TargetsDb, locationId: string) {
  const startTime = performance.now();
  const hotspot = await targetsDb.selectFrom("hotspots").select("id").where("id", "=", locationId).executeTakeFirst();

  if (!hotspot) {
    throw new HTTPException(404, { message: "Hotspot not found" });
  }

  const rows = await targetsDb
    .selectFrom("monthObs")
    .innerJoin("species", "species.id", "monthObs.speciesId")
    .where("monthObs.locationId", "=", locationId)
    .select(["species.code", "species.name", "monthObs.month", "monthObs.obs", "monthObs.samples"])
    .execute();

  const samples: (number | null)[] = Array(12).fill(null);
  const speciesByCode = new Map<string, { name: string; obs: number[] }>();

  for (const row of rows) {
    const monthIdx = row.month - 1;
    if (samples[monthIdx] === null) {
      samples[monthIdx] = row.samples;
    }
    let speciesEntry = speciesByCode.get(row.code);
    if (!speciesEntry) {
      speciesEntry = { name: row.name, obs: Array(12).fill(0) };
      speciesByCode.set(row.code, speciesEntry);
    }
    speciesEntry.obs[monthIdx] = row.obs;
  }

  const items = [...speciesByCode.entries()].map(([code, speciesEntry]) => ({
    code,
    name: speciesEntry.name,
    obs: speciesEntry.obs,
  }));

  return {
    items,
    samples,
    citation: await getEbdCitation(targetsDb),
    queryTime: `${Math.round(performance.now() - startTime)} ms`,
  };
}
