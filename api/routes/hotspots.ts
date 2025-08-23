import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import connect from "../lib/db.js";
import Hotspot from "../models/Hotspot.js";

const hotspots = new Hono();

hotspots.get("/", async (c) => {
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
