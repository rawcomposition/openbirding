import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import connect from "../lib/db.js";
import Hotspot from "../models/Hotspot.js";
import type { Hotspot as HotspotType } from "../lib/types.js";

type EBirdHotspot = {
  locId: string;
  name: string;
  latitude: number;
  longitude: number;
  countryCode: string;
  countryName: string;
  subnational1Code: string;
  subnational1Name: string;
  subnational2Code: string;
  subnational2Name: string;
  isHotspot: boolean;
  locName: string;
  lat: number;
  lng: number;
  hierarchicalName: string;
  locID: string;
};

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
