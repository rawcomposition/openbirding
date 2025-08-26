import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import connect from "../lib/db.js";
import Hotspot from "../models/Hotspot.js";

const getHotspot = new Hono();

getHotspot.get("/", async (c) => {
  try {
    const locationId = c.req.query("locationId");

    if (!locationId) {
      throw new HTTPException(400, { message: "Location ID is required" });
    }

    await connect();

    const hotspot = await Hotspot.findById(locationId);

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

export default getHotspot;
