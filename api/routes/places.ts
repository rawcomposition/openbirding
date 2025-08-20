import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import connect from "../lib/db.js";
import Hotspot from "../models/Hotspot.js";

const places = new Hono();

places.get("/:coordinates", async (c) => {
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

    const hotspots = await Hotspot.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
        },
      },
    })
      .limit(200)
      .lean();

    const count = hotspots.length;

    return c.json({
      coordinates: { lat, lng },
      hotspots,
      count,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching hotspots near coordinates:", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspots" });
  }
});

export default places;
