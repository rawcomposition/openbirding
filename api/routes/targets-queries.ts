import { HTTPException } from "hono/http-exception";
import { sql } from "kysely";
import { db, type TargetsDb } from "../db/index.js";
import { getEbdCitation } from "../lib/ebird.js";
import { parseRegionCodes } from "./targets-validators.js";

type HotspotsRequestOptions = {
  speciesCode: string;
  region: string | null;
  limit: number;
  months: number[] | null;
  minObservations: number | null;
  bbox: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } | null;
  locationIds: string[] | null;
};

type HotspotBaseRow = {
  id: string;
  name: string;
  countryCode: string;
  subnational1Code: string | null;
  lat: number;
  lng: number;
  obs: number;
  samples: number;
};

type HotspotScoreRow = HotspotBaseRow & {
  score: number;
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

async function resolveSpeciesId(targetsDb: TargetsDb, speciesCode: string) {
  const species = await targetsDb
    .selectFrom("species")
    .select("id")
    .where("code", "=", speciesCode.toLowerCase())
    .executeTakeFirst();

  if (!species) {
    throw new HTTPException(404, { message: "Species not found" });
  }

  return species.id;
}

async function loadRegionMap(rows: Array<{ countryCode: string; subnational1Code: string | null }>, region: string | null) {
  let regionMap = new Map<string, string | null>();
  if (!region) {
    const regionCodes = [...new Set(rows.flatMap((row) => [row.countryCode, row.subnational1Code]))];
    const regions = await db
      .selectFrom("regions")
      .select(["id", "longName"])
      .where("id", "in", regionCodes)
      .execute();
    regionMap = new Map(regions.map((r) => [r.id, r.longName]));
  }
  return regionMap;
}

function applyHotspotWhereFilters<T>(query: T, options: Pick<HotspotsRequestOptions, "region" | "bbox" | "locationIds">): T {
  let filteredQuery = query as any;

  if (options.region) {
    filteredQuery = filteredQuery.where("hotspots.regionCode", "like", `${options.region}%`);
  }

  if (options.locationIds) {
    filteredQuery = filteredQuery.where("hotspots.id", "in", options.locationIds);
  }

  if (options.bbox) {
    filteredQuery = filteredQuery
      .where("hotspots.lat", ">=", options.bbox.minLat)
      .where("hotspots.lat", "<=", options.bbox.maxLat)
      .where("hotspots.lng", ">=", options.bbox.minLng)
      .where("hotspots.lng", "<=", options.bbox.maxLng);
  }

  return filteredQuery;
}

function mapHotspotRegion(
  row: Pick<HotspotBaseRow, "countryCode" | "subnational1Code">,
  regionMap: Map<string, string | null>
) {
  return (row.subnational1Code ? regionMap.get(row.subnational1Code) : undefined) || regionMap.get(row.countryCode) || null;
}

function mapScoredHotspotItems(rows: HotspotScoreRow[], regionMap: Map<string, string | null>) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    region: mapHotspotRegion(row, regionMap),
    lat: row.lat,
    lng: row.lng,
    score: Math.round(row.score * 1000) / 10,
    frequency: Math.round((row.obs / row.samples) * 1000) / 10,
    samples: row.samples,
  }));
}

function mapFrequencyHotspotItems(rows: HotspotBaseRow[], regionMap: Map<string, string | null>) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    region: mapHotspotRegion(row, regionMap),
    lat: row.lat,
    lng: row.lng,
    frequency: Math.round((row.obs / row.samples) * 1000) / 10,
    samples: row.samples,
  }));
}

async function fetchGetHotspotRows(targetsDb: TargetsDb, speciesId: number, options: HotspotsRequestOptions): Promise<HotspotScoreRow[]> {
  if (options.months) {
    const [month] = options.months;
    let query = targetsDb
      .selectFrom("monthObs")
      .innerJoin("hotspots", "monthObs.locationId", "hotspots.id")
      .where("monthObs.speciesId", "=", speciesId)
      .where("monthObs.month", "=", month)
      .select([
        "hotspots.id",
        "hotspots.name",
        "hotspots.countryCode",
        "hotspots.subnational1Code",
        "hotspots.lat",
        "hotspots.lng",
        "monthObs.obs",
        "monthObs.samples",
        "monthObs.score",
      ])
      .orderBy("score", "desc")
      .limit(options.limit);

    if (options.minObservations != null) {
      query = query.where("monthObs.obs", ">=", options.minObservations);
    }

    return applyHotspotWhereFilters(query, options).execute();
  }

  let query = targetsDb
    .selectFrom("yearObs")
    .innerJoin("hotspots", "yearObs.locationId", "hotspots.id")
    .where("yearObs.speciesId", "=", speciesId)
    .select([
      "hotspots.id",
      "hotspots.name",
      "hotspots.countryCode",
      "hotspots.subnational1Code",
      "hotspots.lat",
      "hotspots.lng",
      "yearObs.obs",
      "yearObs.samples",
      "yearObs.score",
    ])
    .orderBy("score", "desc")
    .limit(options.limit);

  if (options.minObservations != null) {
    query = query.where("yearObs.obs", ">=", options.minObservations);
  }

  return applyHotspotWhereFilters(query, options).execute();
}

async function fetchPostHotspotRows(targetsDb: TargetsDb, speciesId: number, options: HotspotsRequestOptions): Promise<HotspotBaseRow[]> {
  if (options.months) {
    const monthList = sql.join(options.months.map((month) => sql`${month}`), sql`, `);
    const obsExpr = sql<number>`SUM(month_obs.obs)`;
    const samplesExpr = sql<number>`SUM(month_obs.samples)`;
    const frequencyExpr = sql<number>`(${obsExpr} * 1.0 / ${samplesExpr})`;

    let query = targetsDb
      .selectFrom("monthObs as month_obs")
      .innerJoin("hotspots", "month_obs.locationId", "hotspots.id")
      .where("month_obs.speciesId", "=", speciesId)
      .where(sql<boolean>`month_obs.month IN (${monthList})`)
      .select([
        "hotspots.id",
        "hotspots.name",
        "hotspots.countryCode",
        "hotspots.subnational1Code",
        "hotspots.lat",
        "hotspots.lng",
        obsExpr.as("obs"),
        samplesExpr.as("samples"),
      ])
      .groupBy([
        "hotspots.id",
        "hotspots.name",
        "hotspots.countryCode",
        "hotspots.subnational1Code",
        "hotspots.lat",
        "hotspots.lng",
      ])
      .orderBy(frequencyExpr, "desc")
      .orderBy(obsExpr, "desc")
      .limit(options.limit);

    if (options.minObservations != null) {
      query = query.having(obsExpr, ">=", options.minObservations);
    }

    return applyHotspotWhereFilters(query, options).execute();
  }

  let query = targetsDb
    .selectFrom("yearObs as year_obs")
    .innerJoin("hotspots", "year_obs.locationId", "hotspots.id")
    .where("year_obs.speciesId", "=", speciesId)
    .select([
      "hotspots.id",
      "hotspots.name",
      "hotspots.countryCode",
      "hotspots.subnational1Code",
      "hotspots.lat",
      "hotspots.lng",
      "year_obs.obs",
      "year_obs.samples",
    ])
    .orderBy(sql`(year_obs.obs * 1.0 / year_obs.samples)`, "desc")
    .orderBy("year_obs.obs", "desc")
    .limit(options.limit);

  if (options.minObservations != null) {
    query = query.where("year_obs.obs", ">=", options.minObservations);
  }

  return applyHotspotWhereFilters(query, options).execute();
}

export async function executeHotspotsQuery(targetsDb: TargetsDb, options: HotspotsRequestOptions) {
  const startTime = performance.now();
  const speciesId = await resolveSpeciesId(targetsDb, options.speciesCode);
  const rows = await fetchGetHotspotRows(targetsDb, speciesId, options);
  const regionMap = await loadRegionMap(rows, options.region);
  const items = mapScoredHotspotItems(rows, regionMap);

  const queryTime = Math.round(performance.now() - startTime);
  return { items, citation: await getEbdCitation(targetsDb), queryTime: `${queryTime} ms` };
}

export async function executeHotspotsPostQuery(targetsDb: TargetsDb, options: HotspotsRequestOptions) {
  const startTime = performance.now();
  const speciesId = await resolveSpeciesId(targetsDb, options.speciesCode);
  const rows = await fetchPostHotspotRows(targetsDb, speciesId, options);
  const regionMap = await loadRegionMap(rows, options.region);
  const items = mapFrequencyHotspotItems(rows, regionMap);

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
