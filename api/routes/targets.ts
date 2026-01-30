import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "kysely";
import { targetsDb, db } from "../db/index.js";

const LIMIT_DEFAULT = 200;

const targetsRoute = new Hono();

targetsRoute.get("/species/search", async (c) => {
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

targetsRoute.get("/hotspots/:speciesCode", async (c) => {
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
        `${obsTable}.obs`,
        `${obsTable}.samples`,
        `${obsTable}.score`,
      ])
      .orderBy("score", "desc")
      .limit(limit);

    if (month != null) {
      query = query.where("monthObs.month", "=", month);
    }

    // Filter by minObservations if provided and > 2 (2 is the default minimum in the dataset)
    if (minObservations != null && minObservations > 2) {
      query = query.where(`${obsTable}.obs`, ">=", minObservations);
    }

    if (region) {
      query = query.where("hotspots.regionCode", "like", `${region}%`);
    }

    const rows = await query.execute();

    const regionCodes = [...new Set(rows.flatMap((row) => [row.countryCode, row.subnational1Code]))];
    const regions = await db.selectFrom("regions").select(["id", "longName"]).where("id", "in", regionCodes).execute();
    const regionMap = new Map(regions.map((r) => [r.id, r.longName]));

    const hotspots = rows.map((row) => ({
      id: row.id,
      name: row.name,
      region: regionMap.get(row.subnational1Code) || regionMap.get(row.countryCode) || null,
      score: Math.round(row.score * 1000) / 10, // Convert to percentage with 1 decimal
      frequency: Math.round((row.obs / row.samples) * 1000) / 10,
      samples: row.samples,
    }));

    return c.json({ hotspots });
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

export default targetsRoute;
