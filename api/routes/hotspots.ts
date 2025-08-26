import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import connect from "../lib/db.js";
import Hotspot from "../models/Hotspot.js";
import db from "../lib/sqlite.js";

const hotspots = new Hono();

hotspots.get("/within-bounds", async (c) => {
  try {
    const bounds = c.req.query("bounds");

    if (!bounds) {
      throw new HTTPException(400, { message: "Bounds parameter is required" });
    }

    const [west, south, east, north] = bounds.split(",").map(Number);

    if (bounds.split(",").length !== 4 || [west, south, east, north].some(isNaN)) {
      throw new HTTPException(400, { message: "Bounds must be in format: west,south,east,north" });
    }

    await connect();

    const hotspots = await Hotspot.find({
      location: {
        $geoWithin: {
          $box: [
            [west, south],
            [east, north],
          ],
        },
      },
    })
      .select({ name: 1, location: 1, open: 1, species: 1 })
      .lean();

    return c.json({
      hotspots,
      count: hotspots.length,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching hotspots by bounds:", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspots by bounds" });
  }
});

hotspots.get("/by-region-sqlite/:regionCode", async (c) => {
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
      _id: hotspot.id,
      name: hotspot.name,
      region: hotspot.region,
      country: hotspot.country,
      state: hotspot.state,
      county: hotspot.county,
      species: hotspot.species,
      location: {
        type: "Point" as const,
        coordinates: [hotspot.lng, hotspot.lat] as [number, number],
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

hotspots.get("/by-region/:regionCode", async (c) => {
  try {
    const regionCode = c.req.param("regionCode");

    if (!regionCode) {
      throw new HTTPException(400, { message: "Region code is required" });
    }

    await connect();

    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "50000");
    const skip = (page - 1) * limit;
    const [hotspots, totalCount] = await Promise.all([
      Hotspot.find({ region: { $regex: `^${regionCode}` } }, { name: 1, open: 1, notes: 1, species: 1, location: 1 })
        .sort({ species: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Hotspot.countDocuments({ region: { $regex: `^${regionCode}` } }),
    ]);

    return c.json({
      hotspots,
      count: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching region hotspots:", error);
    throw new HTTPException(500, { message: "Failed to fetch region hotspots" });
  }
});

hotspots.get("/nearby/:coordinates", async (c) => {
  try {
    const { coordinates } = c.req.param();

    if (!coordinates) {
      throw new HTTPException(400, { message: "Coordinates are required" });
    }

    const [lat, lng] = coordinates.split(",").map(Number);

    if (isNaN(lat) || isNaN(lng)) {
      throw new HTTPException(400, { message: "Invalid coordinates format" });
    }

    await connect();

    const hotspots = await Hotspot.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [lng, lat],
          },
          distanceField: "distance",
          spherical: true,
          maxDistance: 50000000,
        },
      },
      {
        $limit: 200,
      },
    ]);

    return c.json(hotspots);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching hotspots near coordinates:", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspots" });
  }
});

hotspots.put("/bulk-update", async (c) => {
  try {
    const updates = await c.req.json<Array<{ _id: string; open?: boolean | null; notes?: string }>>();

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new HTTPException(400, { message: "Updates array is required and must not be empty" });
    }

    await connect();

    const bulkOps = updates.map((update) => ({
      updateOne: {
        filter: { _id: update._id },
        update: {
          $set: {
            ...(update.open !== undefined && { open: update.open }),
            ...(update.notes !== undefined && { notes: update.notes }),
            updatedAt: new Date(),
          },
        },
      },
    }));

    const result = await Hotspot.bulkWrite(bulkOps);

    if (result.matchedCount !== updates.length) {
      throw new HTTPException(400, { message: "Some hotspots were not found" });
    }

    return c.json({
      message: "Bulk update completed successfully",
      updatedCount: result.modifiedCount,
      totalCount: updates.length,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error bulk updating hotspots:", error);
    throw new HTTPException(500, { message: "Failed to bulk update hotspots" });
  }
});

hotspots.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    if (!id) {
      throw new HTTPException(400, { message: "Hotspot ID is required" });
    }

    await connect();

    const hotspot = await Hotspot.findById(id);

    if (!hotspot) {
      throw new HTTPException(404, { message: "Hotspot not found" });
    }

    return c.json(hotspot);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching hotspot:", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspot" });
  }
});

hotspots.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updateData = await c.req.json<{ notes?: string }>();

    if (!id) {
      throw new HTTPException(400, { message: "Hotspot ID is required" });
    }

    await connect();

    const updatedHotspot = await Hotspot.findByIdAndUpdate(
      id,
      {
        ...updateData,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!updatedHotspot) {
      throw new HTTPException(404, { message: "Hotspot not found" });
    }

    return c.json(updatedHotspot);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error updating hotspot:", error);
    throw new HTTPException(500, { message: "Failed to update hotspot" });
  }
});

export default hotspots;
