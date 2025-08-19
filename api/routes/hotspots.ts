import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import connect from "../lib/db.js";
import Hotspot from "../models/Hotspot.js";

const hotspots = new Hono();

hotspots.get("/", async (c) => {
  try {
    await connect();

    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "50");
    const skip = (page - 1) * limit;

    const [hotspots, totalCount] = await Promise.all([
      Hotspot.find({}).sort({ species: -1 }).skip(skip).limit(limit).lean(),
      Hotspot.countDocuments({}),
    ]);

    return c.json({
      hotspots,
      count: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error("Error fetching hotspots:", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspots" });
  }
});

hotspots.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updateData = await c.req.json<{ tags?: string[] }>();

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
