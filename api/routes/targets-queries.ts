import { HTTPException } from "hono/http-exception";
import { sql } from "kysely";
import { db, type RawTargetsAccess, type TargetsDb } from "../db/index.js";
import { getTargetsMetadata } from "../db/targets.js";
import { ebdCitation } from "../lib/utils.js";
import { parseRegionCodes } from "./targets-validators.js";

async function getEbdCitation(targetsDb: TargetsDb) {
  const { versionMonth, versionYear } = await getTargetsMetadata(targetsDb);
  return ebdCitation(versionMonth, versionYear);
}

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
  sortBy?: "best" | "frequency" | null;
};

type HotspotBaseRow = {
  id: string;
  name: string;
  countryCode: string;
  subnational1Code: string | null;
  subnational2Code: string | null;
  lat: number;
  lng: number;
  obs: number;
  samples: number;
  score?: number;
};

type HotspotScoreRow = HotspotBaseRow & {
  score: number;
};

type RegionInfo = {
  name: string;
  longName: string | null;
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

async function loadRegionMap(rows: Array<Pick<HotspotBaseRow, "countryCode" | "subnational1Code" | "subnational2Code">>) {
  const regionCodes = [
    ...new Set(rows.flatMap((row) => [row.countryCode, row.subnational1Code, row.subnational2Code]).filter((c): c is string => c != null)),
  ];
  const regions = await db
    .selectFrom("regions")
    .select(["id", "name", "longName"])
    .where("id", "in", regionCodes)
    .execute();
  return new Map<string, RegionInfo>(regions.map((region) => [region.id, { name: region.name, longName: region.longName }]));
}

function applyHotspotWhereFilters<T>(query: T, options: Pick<HotspotsRequestOptions, "region" | "bbox" | "locationIds">): T {
  let filteredQuery = query as any;

  if (options.region) {
    const codes = parseRegionCodes(options.region);
    filteredQuery = filteredQuery.where((eb: any) =>
      eb.or(codes.map((code) => eb("hotspots.regionCode", "like", `${code}%`)))
    );
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
  row: Pick<HotspotBaseRow, "countryCode" | "subnational1Code" | "subnational2Code">,
  regionMap: Map<string, RegionInfo>,
  selectedRegion: string | null
) {
  const deepestRegionCode = row.subnational2Code || row.subnational1Code || row.countryCode;
  const deepestRegion = regionMap.get(deepestRegionCode);

  if (!deepestRegion) {
    return null;
  }

  if (!selectedRegion) {
    return deepestRegion.longName || deepestRegion.name;
  }

  if (deepestRegionCode === selectedRegion) {
    return null;
  }

  const breadcrumbParts: string[] = [];
  let currentRegionCode: string | null = deepestRegionCode;

  while (currentRegionCode && currentRegionCode !== selectedRegion) {
    const region = regionMap.get(currentRegionCode);
    if (!region) {
      return null;
    }

    breadcrumbParts.push(region.name);
    currentRegionCode = currentRegionCode.includes("-")
      ? currentRegionCode.slice(0, currentRegionCode.lastIndexOf("-"))
      : null;
  }

  return currentRegionCode === selectedRegion ? breadcrumbParts.join(", ") : null;
}

function mapScoredHotspotItems(rows: HotspotScoreRow[], regionMap: Map<string, RegionInfo>, selectedRegion: string | null) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    region: mapHotspotRegion(row, regionMap, selectedRegion),
    lat: row.lat,
    lng: row.lng,
    score: Math.round(row.score * 1000) / 10,
    frequency: Math.round((row.obs / row.samples) * 1000) / 10,
    samples: row.samples,
  }));
}

function mapFrequencyHotspotItems(rows: HotspotBaseRow[], regionMap: Map<string, RegionInfo>, selectedRegion: string | null) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    region: mapHotspotRegion(row, regionMap, selectedRegion),
    lat: row.lat,
    lng: row.lng,
    frequency: Math.round((row.obs / row.samples) * 1000) / 10,
    samples: row.samples,
    ...(row.score != null ? { score: Math.round(row.score * 1000) / 10 } : {}),
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
        "hotspots.subnational2Code",
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
      "hotspots.subnational2Code",
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
  const useBest = options.sortBy === "best";

  if (options.months) {
    const monthList = sql.join(options.months.map((month) => sql`${month}`), sql`, `);
    const obsExpr = sql<number>`SUM(month_obs.obs)`;
    const samplesExpr = sql<number>`SUM(month_obs.samples)`;
    const frequencyExpr = sql<number>`(${obsExpr} * 1.0 / ${samplesExpr})`;
    const scoreExpr = sql<number>`(SUM(month_obs.score * month_obs.samples) * 1.0 / NULLIF(${samplesExpr}, 0))`;

    const baseSelect = [
      "hotspots.id",
      "hotspots.name",
      "hotspots.countryCode",
      "hotspots.subnational1Code",
      "hotspots.subnational2Code",
      "hotspots.lat",
      "hotspots.lng",
      obsExpr.as("obs"),
      samplesExpr.as("samples"),
    ] as const;

    let query = targetsDb
      .selectFrom("monthObs as month_obs")
      .innerJoin("hotspots", "month_obs.locationId", "hotspots.id")
      .where("month_obs.speciesId", "=", speciesId)
      .where(sql<boolean>`month_obs.month IN (${monthList})`)
      .select(useBest ? [...baseSelect, scoreExpr.as("score")] : [...baseSelect])
      .groupBy([
        "hotspots.id",
        "hotspots.name",
        "hotspots.countryCode",
        "hotspots.subnational1Code",
        "hotspots.subnational2Code",
        "hotspots.lat",
        "hotspots.lng",
      ])
      .$if(useBest, (qb) => qb.orderBy(scoreExpr, "desc").orderBy(obsExpr, "desc"))
      .$if(!useBest, (qb) => qb.orderBy(frequencyExpr, "desc").orderBy(obsExpr, "desc"))
      .limit(options.limit);

    if (options.minObservations != null) {
      query = query.having(obsExpr, ">=", options.minObservations);
    }

    return applyHotspotWhereFilters(query, options).execute();
  }

  const baseSelect = [
    "hotspots.id",
    "hotspots.name",
    "hotspots.countryCode",
    "hotspots.subnational1Code",
    "hotspots.subnational2Code",
    "hotspots.lat",
    "hotspots.lng",
    "year_obs.obs",
    "year_obs.samples",
  ] as const;

  let query = targetsDb
    .selectFrom("yearObs as year_obs")
    .innerJoin("hotspots", "year_obs.locationId", "hotspots.id")
    .where("year_obs.speciesId", "=", speciesId)
    .select(useBest ? [...baseSelect, "year_obs.score"] : [...baseSelect])
    .$if(useBest, (qb) => qb.orderBy("year_obs.score", "desc").orderBy("year_obs.obs", "desc"))
    .$if(!useBest, (qb) =>
      qb.orderBy(sql`(year_obs.obs * 1.0 / year_obs.samples)`, "desc").orderBy("year_obs.obs", "desc")
    )
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
  const regionMap = await loadRegionMap(rows);
  const items = mapScoredHotspotItems(rows, regionMap, options.region);

  const queryTime = Math.round(performance.now() - startTime);
  return { items, citation: await getEbdCitation(targetsDb), queryTime: `${queryTime} ms` };
}

export async function executeHotspotsPostQuery(targetsDb: TargetsDb, options: HotspotsRequestOptions) {
  const startTime = performance.now();
  const speciesId = await resolveSpeciesId(targetsDb, options.speciesCode);
  const rows = await fetchPostHotspotRows(targetsDb, speciesId, options);
  const regionMap = await loadRegionMap(rows);
  const items = mapFrequencyHotspotItems(rows, regionMap, options.region);

  const queryTime = Math.round(performance.now() - startTime);
  return { items, citation: await getEbdCitation(targetsDb), queryTime: `${queryTime} ms` };
}

type TargetsSpeciesRow = {
  code: string;
  name: string;
  sciName: string;
  taxonOrder: number;
  month: number;
  obs: number;
};

function buildMonthlySamples(samplesRows: Array<{ month: number; samples: number }>): number[] {
  const samples: number[] = Array(12).fill(0);
  for (const row of samplesRows) {
    samples[row.month - 1] = row.samples;
  }
  return samples;
}

function buildTargetsItems(speciesRows: TargetsSpeciesRow[], samples: number[], months: number[] | null) {
  const monthFilter = months ? new Set(months) : null;
  type SpeciesEntry = {
    name: string;
    sciName: string;
    taxonOrder: number;
    obs: number[];
    filteredObs: number;
    filteredSamples: number;
  };
  const speciesByCode = new Map<string, SpeciesEntry>();

  for (const row of speciesRows) {
    let entry = speciesByCode.get(row.code);
    if (!entry) {
      entry = {
        name: row.name,
        sciName: row.sciName,
        taxonOrder: row.taxonOrder,
        obs: Array(12).fill(0),
        filteredObs: 0,
        filteredSamples: 0,
      };
      speciesByCode.set(row.code, entry);
    }
    const monthIdx = row.month - 1;
    entry.obs[monthIdx] = row.obs;
    if (!monthFilter || monthFilter.has(row.month)) {
      entry.filteredObs += row.obs;
      entry.filteredSamples += samples[monthIdx];
    }
  }

  return [...speciesByCode.entries()]
    .filter(([, entry]) => entry.filteredObs > 0 && entry.filteredSamples > 0)
    .map(([code, entry]) => ({
      code,
      name: entry.name,
      sciName: entry.sciName,
      frequency: roundFrequency((entry.filteredObs / entry.filteredSamples) * 100),
      obs: entry.obs,
      _filteredObs: entry.filteredObs,
      _taxonOrder: entry.taxonOrder,
    }))
    .sort((a, b) => {
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      if (b._filteredObs !== a._filteredObs) return b._filteredObs - a._filteredObs;
      return a._taxonOrder - b._taxonOrder;
    })
    .map(({ _filteredObs, _taxonOrder, ...rest }) => rest);
}

export async function executeRegionTargetsQuery(targetsDb: TargetsDb, regionCode: string, months: number[] | null) {
  const startTime = performance.now();
  const regionCodes = parseRegionCodes(regionCode);
  const regionConditions = buildRegionConditions(regionCodes);
  const regionIdSubquery = sql`SELECT id FROM regions WHERE ${regionConditions}`;

  const [speciesResult, samplesResult] = await Promise.all([
    sql<TargetsSpeciesRow>`
      SELECT
        s.code,
        s.name,
        s.sci_name,
        s.taxon_order,
        rmo.month,
        SUM(rmo.obs) AS obs
      FROM region_month_obs rmo
      JOIN species s ON s.id = rmo.species_id
      WHERE rmo.region_id IN (${regionIdSubquery})
      GROUP BY rmo.species_id, rmo.month
    `.execute(targetsDb),

    sql<{ month: number; samples: number }>`
      SELECT month, SUM(samples) AS samples
      FROM region_month_samples
      WHERE region_id IN (${regionIdSubquery})
      GROUP BY month
    `.execute(targetsDb),
  ]);

  const samples = buildMonthlySamples(samplesResult.rows);
  const items = buildTargetsItems(speciesResult.rows, samples, months);

  return {
    items,
    samples,
    citation: await getEbdCitation(targetsDb),
    queryTime: `${Math.round(performance.now() - startTime)} ms`,
  };
}

export async function executeH3TargetsQuery(targetsDb: TargetsDb, cells: bigint[], months: number[] | null) {
  const startTime = performance.now();
  const cellList = sql.join(cells.map((cell) => sql`${cell}`), sql`, `);
  const cellRefsResult = await sql<{ res: number; cellRef: number }>`
    SELECT res, cell_ref FROM h3_cells WHERE h3 IN (${cellList})
  `.execute(targetsDb);

  if (cellRefsResult.rows.length === 0) {
    return {
      items: [],
      samples: Array(12).fill(0),
      cellCount: 0,
      citation: await getEbdCitation(targetsDb),
      queryTime: `${Math.round(performance.now() - startTime)} ms`,
    };
  }

  // cell_ref is only unique per resolution — filter on (res, cell_ref) pairs
  // or refs from other resolutions with the same number would leak in.
  const refList = sql.join(cellRefsResult.rows.map((row) => sql`(${row.res}, ${row.cellRef})`), sql`, `);

  const [speciesResult, samplesResult] = await Promise.all([
    sql<TargetsSpeciesRow>`
      SELECT
        s.code,
        s.name,
        s.sci_name,
        s.taxon_order,
        o.month,
        SUM(o.obs) AS obs
      FROM h3_cell_obs o
      JOIN species s ON s.id = o.species_id
      WHERE (o.res, o.cell_ref) IN (VALUES ${refList})
      GROUP BY o.species_id, o.month
    `.execute(targetsDb),

    sql<{ month: number; samples: number }>`
      SELECT month, SUM(samples) AS samples
      FROM h3_cell_samples
      WHERE (res, cell_ref) IN (VALUES ${refList})
      GROUP BY month
    `.execute(targetsDb),
  ]);

  const samples = buildMonthlySamples(samplesResult.rows);
  const items = buildTargetsItems(speciesResult.rows, samples, months);

  return {
    items,
    samples,
    cellCount: cellRefsResult.rows.length,
    citation: await getEbdCitation(targetsDb),
    queryTime: `${Math.round(performance.now() - startTime)} ms`,
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

export async function executeLocationsTargetsQuery(access: RawTargetsAccess, locationIds: string[], months: number[] | null) {
  const startTime = performance.now();
  const { sqlite } = access;

  const speciesById = new Map<number, { code: string; name: string }>();
  for (const [id, code, name] of sqlite.prepare("SELECT id, code, name FROM species").raw().all() as [number, string, string][]) {
    speciesById.set(id, { code, name });
  }

  const idPlaceholders = locationIds.map(() => "?").join(", ");
  const monthClause = months ? ` AND month IN (${months.map(() => "?").join(", ")})` : "";
  const statement = sqlite.prepare(
    `SELECT location_id, group_concat(species_id), group_concat(month), group_concat(obs), group_concat(samples)
     FROM month_obs WHERE location_id IN (${idPlaceholders})${monthClause} GROUP BY location_id`
  );
  const packedRows = statement.raw().all(...locationIds, ...(months ?? [])) as [string, string, string, string, string][];

  const locations: Record<string, { items: Array<{ code: string; name: string; obs: number[] }>; samples: (number | null)[] }> = {};
  for (const [locationId, speciesIds, packedMonths, packedObs, packedSamples] of packedRows) {
    const speciesCol = speciesIds.split(",");
    const monthCol = packedMonths.split(",");
    const obsCol = packedObs.split(",");
    const samplesCol = packedSamples.split(",");

    const samples: (number | null)[] = Array(12).fill(null);
    const obsBySpeciesId = new Map<number, number[]>();
    for (let i = 0; i < speciesCol.length; i++) {
      const monthIdx = +monthCol[i] - 1;
      if (samples[monthIdx] === null) {
        samples[monthIdx] = +samplesCol[i];
      }
      const speciesId = +speciesCol[i];
      let obs = obsBySpeciesId.get(speciesId);
      if (!obs) {
        obs = Array(12).fill(0);
        obsBySpeciesId.set(speciesId, obs);
      }
      obs[monthIdx] = +obsCol[i];
    }

    const items: Array<{ code: string; name: string; obs: number[] }> = [];
    for (const [speciesId, obs] of obsBySpeciesId) {
      const species = speciesById.get(speciesId);
      if (species) {
        items.push({ code: species.code, name: species.name, obs });
      }
    }
    locations[locationId] = { items, samples };
  }

  return {
    locations,
    citation: await getEbdCitation(access.db),
    queryTime: `${Math.round(performance.now() - startTime)} ms`,
  };
}
