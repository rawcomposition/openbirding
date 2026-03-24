import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "kysely";
import { db, isTargetsDbAvailable, withTargetsDb } from "../db/index.js";
import { getEbdCitation } from "../lib/ebird.js";

const LIMIT_DEFAULT = 200;
const REGION_CODE_RE = /^[A-Z]{2}(?:-[A-Z0-9]{1,3}){0,2}$/;

const targetsRoute = new Hono();

targetsRoute.use(async (c, next) => {
  if (!isTargetsDbAvailable()) {
    throw new HTTPException(503, { message: "Targets database not available" });
  }
  await next();
});

targetsRoute.get("/species/search", async (c) => {
  return withTargetsDb(async (targetsDb) => {
    try {
      const query = c.req.query("q");
      if (!query || query.length < 2) {
        return c.json({ species: [] });
      }

      // Escape FTS5 special characters and create prefix search term
      const escaped = query.replace(/['"*()]/g, "").trim();
      const ftsQuery = `"${escaped}"*`;

      const species = await sql<{ code: string; name: string; sciName: string }[]>`
        SELECT s.code, s.name, s.sci_name as "sciName"
        FROM species_fts fts
        JOIN species s ON s.id = fts.rowid
        WHERE species_fts MATCH ${ftsQuery}
        ORDER BY s.taxon_order ASC
        LIMIT 20
      `.execute(targetsDb);

      return c.json({ species: species.rows });
    } catch (error) {
      console.error("Species search error:", error);
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : "Internal Server Error",
      });
    }
  });
});

targetsRoute.get("/hotspots/:speciesCode", async (c) => {
  return withTargetsDb(async (targetsDb) => {
    const startTime = performance.now();
    try {
      const speciesCode = c.req.param("speciesCode");
      if (!speciesCode) {
        throw new HTTPException(400, { message: "Species code is required" });
      }

      const region = c.req.query("region");
      const limitParam = c.req.query("limit");
      const limit = limitParam != null ? parseInt(limitParam) : LIMIT_DEFAULT;
      if (isNaN(limit) || limit < 1) {
        throw new HTTPException(400, { message: "limit must be a positive number" });
      }

      const monthParam = c.req.query("month");
      const month = monthParam != null ? parseInt(monthParam) : null;
      if (month != null && (isNaN(month) || month < 1 || month > 12)) {
        throw new HTTPException(400, { message: "month must be between 1 and 12" });
      }

      const minObsParam = c.req.query("minObservations");
      const minObservations = minObsParam != null ? parseInt(minObsParam) : null;
      if (minObservations != null && (isNaN(minObservations) || minObservations < 1)) {
        throw new HTTPException(400, { message: "minObservations must be a positive number" });
      }

      const bboxParam = c.req.query("bbox");
      let bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null = null;
      if (bboxParam) {
        const parts = bboxParam.split(",").map(Number);
        if (parts.length !== 4 || parts.some(isNaN)) {
          throw new HTTPException(400, { message: "bbox must be minLng,minLat,maxLng,maxLat" });
        }
        bbox = { minLng: parts[0], minLat: parts[1], maxLng: parts[2], maxLat: parts[3] };
      }

      const species = await targetsDb
        .selectFrom("species")
        .select("id")
        .where("code", "=", speciesCode.toLowerCase())
        .executeTakeFirst();

      if (!species) {
        throw new HTTPException(404, { message: "Species not found" });
      }

      const obsTable = month != null ? "monthObs" : "yearObs";

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
        .limit(limit);

      if (month != null) {
        query = query.where("monthObs.month", "=", month);
      }

      if (minObservations != null) {
        query = query.where(`${obsTable}.obs`, ">=", minObservations);
      }

      if (region) {
        query = query.where("hotspots.regionCode", "like", `${region}%`);
      }

      if (bbox) {
        query = query
          .where("hotspots.lat", ">=", bbox.minLat)
          .where("hotspots.lat", "<=", bbox.maxLat)
          .where("hotspots.lng", ">=", bbox.minLng)
          .where("hotspots.lng", "<=", bbox.maxLng);
      }

      const rows = await query.execute();

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

      const hotspots = rows.map((row) => ({
        id: row.id,
        name: row.name,
        region: regionMap.get(row.subnational1Code) || regionMap.get(row.countryCode) || null,
        lat: row.lat,
        lng: row.lng,
        score: Math.round(row.score * 1000) / 10, // Convert to percentage with 1 decimal
        frequency: Math.round((row.obs / row.samples) * 1000) / 10,
        samples: row.samples,
      }));

      const queryTime = Math.round(performance.now() - startTime);
      return c.json({ hotspots, citation: await getEbdCitation(targetsDb), queryTime: `${queryTime} ms` });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error("Targets hotspots error:", error);
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : "Internal Server Error",
      });
    }
  });
});

function roundFrequency(pct: number): number {
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

targetsRoute.get("/region-species", async (c) => {
  return withTargetsDb(async (targetsDb) => {
    const startTime = performance.now();
    try {
      const regionsParam = c.req.query("regions");
      if (!regionsParam) {
        throw new HTTPException(400, { message: "regions parameter is required" });
      }

      const rawCodes = regionsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (rawCodes.length === 0) {
        throw new HTTPException(400, { message: "At least one region code is required" });
      }
      if (rawCodes.length > 20) {
        throw new HTTPException(400, { message: "Maximum 20 region codes allowed" });
      }
      if (rawCodes.some((code) => !REGION_CODE_RE.test(code))) {
        throw new HTTPException(400, {
          message: "regions must be comma-separated eBird region codes like US, US-CA, or US-CA-065",
        });
      }

      // Deduplicate: remove child regions already covered by a parent
      const sorted = [...new Set(rawCodes)].sort((a, b) => a.length - b.length || a.localeCompare(b));
      const regionCodes: string[] = [];
      for (const code of sorted) {
        const coveredByParent = regionCodes.some((parent) => code.startsWith(parent + "-"));
        if (!coveredByParent) {
          regionCodes.push(code);
        }
      }

      const monthsParam = c.req.query("months");
      let months: number[] | null = null;
      if (monthsParam) {
        months = [...new Set(monthsParam.split(",").map(Number))].sort((a, b) => a - b);
        if (months.some((m) => isNaN(m) || m < 1 || m > 12)) {
          throw new HTTPException(400, { message: "months must be comma-separated values between 1 and 12" });
        }
      }

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
        sql<{ code: string; name: string; obs: number; samples: number; obsYear: number; samplesYear: number }>`
          SELECT
            s.code,
            s.name,
            ${obsExpr} AS obs,
            ${samplesExpr} AS samples,
            SUM(rmo.obs) AS "obsYear",
            SUM(rms.samples) AS "samplesYear"
          FROM region_month_obs rmo
          JOIN region_month_samples rms ON rms.region_id = rmo.region_id AND rms.month = rmo.month
          JOIN species s ON s.id = rmo.species_id
          WHERE rmo.region_id IN (${regionIdSubquery})
          GROUP BY rmo.species_id
          HAVING ${obsExpr} > 0
          ORDER BY (${obsExpr} * 1.0 / ${samplesExpr}) DESC, ${obsExpr} DESC, s.taxon_order ASC
        `.execute(targetsDb),

        sql<{ samples: number; samplesYear: number }>`
          SELECT
            ${monthList
              ? sql`SUM(CASE WHEN month IN (${monthList}) THEN samples ELSE 0 END)`
              : sql`SUM(samples)`} AS samples,
            SUM(samples) AS "samplesYear"
          FROM region_month_samples
          WHERE region_id IN (${regionIdSubquery})
        `.execute(targetsDb),
      ]);

      const totals = totalsResult.rows[0];
      const response = {
        items: speciesResult.rows.map((row) => ({
          name: row.name,
          code: row.code,
          frequency: roundFrequency((row.obs / row.samples) * 100),
          frequencyYear: roundFrequency((row.obsYear / row.samplesYear) * 100),
        })),
        samples: totals?.samples ?? 0,
        samplesYear: totals?.samplesYear ?? 0,
      };

      const queryTime = Math.round(performance.now() - startTime);
      return c.json({
        ...response,
        queryTime: `${queryTime} ms`,
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error("Region species error:", error);
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : "Internal Server Error",
      });
    }
  });
});

targetsRoute.get("/hotspot-species/:locationId", async (c) => {
  return withTargetsDb(async (targetsDb) => {
    try {
      const locationId = c.req.param("locationId");
      if (!locationId) {
        throw new HTTPException(400, { message: "locationId is required" });
      }

      const hotspot = await targetsDb.selectFrom("hotspots").select("id").where("id", "=", locationId).executeTakeFirst();

      if (!hotspot) {
        throw new HTTPException(404, { message: "Hotspot not found" });
      }

      const rows = await targetsDb
        .selectFrom("monthObs")
        .innerJoin("species", "species.id", "monthObs.speciesId")
        .where("monthObs.locationId", "=", locationId)
        .select(["species.code", "monthObs.month", "monthObs.obs", "monthObs.samples"])
        .execute();

      const samples: (number | null)[] = Array(12).fill(null);
      const speciesByCode = new Map<string, number[]>();

      for (const row of rows) {
        const monthIdx = row.month - 1;
        if (samples[monthIdx] === null) {
          samples[monthIdx] = row.samples;
        }
        let monthObs = speciesByCode.get(row.code);
        if (!monthObs) {
          monthObs = Array(12).fill(0);
          speciesByCode.set(row.code, monthObs);
        }
        monthObs[monthIdx] = row.obs;
      }

      const species = [...speciesByCode.entries()].map(([code, monthObs]) => [code, ...monthObs]);

      return c.json({ v: 1, samples, species });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error("Hotspot species error:", error);
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : "Internal Server Error",
      });
    }
  });
});

export default targetsRoute;
