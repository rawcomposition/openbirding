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

    const searchTerm = `%${query.toLowerCase()}%`;

    const species = await targetsDb
      .selectFrom("species")
      .select(["code", "name", "sciName"])
      .where((eb) =>
        eb.or([
          eb(sql`lower(name)`, "like", searchTerm),
          eb(sql`lower(sci_name)`, "like", searchTerm),
          eb(sql`lower(code)`, "like", searchTerm),
        ])
      )
      .orderBy("taxonOrder", "asc")
      .limit(20)
      .execute();

    return c.json({ species });
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

    const locationId = c.req.query("locationId");
    const region = c.req.query("region");
    const limitParam = c.req.query("limit");
    const limit = limitParam != null ? parseInt(limitParam) : LIMIT_DEFAULT;
    if (isNaN(limit) || limit < 1) {
      throw new HTTPException(400, { message: "limit must be a positive number" });
    }
    if (locationId && region) {
      throw new HTTPException(400, {
        message: "Provide only one of locationId or region",
      });
    }

    const species = await targetsDb
      .selectFrom("species")
      .select("id")
      .where("code", "=", speciesCode.toLowerCase())
      .executeTakeFirst();

    if (!species) {
      throw new HTTPException(404, { message: "Species not found" });
    }

    let query = targetsDb
      .selectFrom("yearObs")
      .innerJoin("hotspots", "yearObs.locationId", "hotspots.id")
      .where("yearObs.speciesId", "=", species.id)
      .select([
        "hotspots.id",
        "hotspots.name",
        "hotspots.countryCode",
        "hotspots.subnational1Code",
        "yearObs.obs",
        "yearObs.samples",
        "yearObs.score", // Wilson Score Lower Bound (95% CI), pre-computed
      ])
      .orderBy("score", "desc")
      .limit(limit);

    if (locationId) {
      query = query.where("hotspots.id", "=", locationId);
    } else if (region) {
      query = query.where((eb) =>
        eb.or([
          eb("hotspots.countryCode", "=", region),
          eb("hotspots.subnational1Code", "=", region),
          eb("hotspots.subnational2Code", "=", region),
        ])
      );
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
