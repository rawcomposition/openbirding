import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../lib/sqlite.js";

const sqliteHotspots = new Hono();

sqliteHotspots.get("/region/:regionCode", async (c) => {
  try {
    const regionCode = c.req.param("regionCode");

    if (!regionCode) {
      throw new HTTPException(400, { message: "Region code is required" });
    }

    const hotspots = await db
      .selectFrom("hotspots")
      .selectAll()
      .where("region", "=", regionCode)
      .orderBy("species", "desc")
      .execute();

    const transformedHotspots = hotspots.map((hotspot) => ({
      _id: hotspot._id,
      name: hotspot.name,
      region: hotspot.region,
      country: hotspot.county,
      state: hotspot.state,
      county: hotspot.county,
      species: hotspot.species,
      location: {
        type: "Point" as const,
        coordinates: [hotspot.longitude, hotspot.latitude] as [number, number],
      },
      open: hotspot.open === 1 ? true : hotspot.open === 0 ? false : null,
      notes: hotspot.notes,
      updatedAt: hotspot.updatedAt ? new Date(hotspot.updatedAt) : undefined,
    }));

    return c.json({
      hotspots: transformedHotspots,
      count: transformedHotspots.length,
      regionCode,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching hotspots by region from SQLite:", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspots by region" });
  }
});

export default sqliteHotspots;
