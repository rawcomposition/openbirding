import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "kysely";
import { targetsDb } from "../db/index.js";

const LIMIT_DEFAULT = 200;

const targetsRoute = new Hono();

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

    console.time("species lookup");
    const species = await targetsDb
      .selectFrom("species")
      .select("id")
      .where("code", "=", speciesCode.toLowerCase())
      .executeTakeFirst();
    console.timeEnd("species lookup");

    if (!species) {
      throw new HTTPException(404, { message: "Species not found" });
    }

    console.time("hotspots query");
    let query = targetsDb
      .selectFrom("yearObs")
      .innerJoin("hotspots", "yearObs.locationId", "hotspots.id")
      .where("yearObs.speciesId", "=", species.id)
      .where("yearObs.samples", ">=", 5)
      .select([
        "hotspots.id",
        "hotspots.name",
        "yearObs.samples",
        // Wilson Score Lower Bound (95% CI) - accounts for sample size uncertainty
        // Formula: (p + z²/2n - z√(p(1-p)/n + z²/4n²)) / (1 + z²/n) where z=1.96
        sql<number>`ROUND(100.0 * (
          year_obs.obs + 1.9208
          - 1.96 * SQRT(year_obs.obs * (year_obs.samples - year_obs.obs) / year_obs.samples + 0.9604)
        ) / (year_obs.samples + 3.8416), 1)`.as("score"),
        sql<number>`ROUND(100.0 * year_obs.obs / year_obs.samples, 1)`.as("frequency"),
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
    console.timeEnd("hotspots query");

    const hotspots = rows.map((row) => ({
      id: row.id,
      name: row.name,
      score: row.score,
      frequency: row.frequency,
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
