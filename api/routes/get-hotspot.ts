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

    const ebirdApiKey = process.env.EBIRD_API_KEY;
    if (!ebirdApiKey) {
      throw new HTTPException(500, { message: "eBird API key not configured" });
    }

    await connect();

    const mongoHotspot = await Hotspot.findById(locationId);

    const ebirdResponse = await fetch(`https://api.ebird.org/v2/ref/hotspot/info/${locationId}`, {
      headers: {
        "X-eBirdApiToken": ebirdApiKey,
      },
    });

    if (!ebirdResponse.ok) {
      if (mongoHotspot) {
        return c.json(mongoHotspot);
      }

      throw new HTTPException(404, { message: "Hotspot not found in eBird or local database" });
    }

    const ebirdHotspot = (await ebirdResponse.json()) as EBirdHotspot;

    const hotspotData: Partial<HotspotType> = {
      _id: ebirdHotspot.locId,
      name: ebirdHotspot.name,
      lat: ebirdHotspot.latitude,
      lng: ebirdHotspot.longitude,
      country: ebirdHotspot.countryName,
      state: ebirdHotspot.subnational1Name,
      county: ebirdHotspot.subnational2Name,
      species: 0,
    };

    if (mongoHotspot) {
      hotspotData.species = mongoHotspot.species;
      hotspotData.createdAt = mongoHotspot.createdAt;
      hotspotData.updatedAt = new Date().toISOString();
    } else {
      const now = new Date().toISOString();
      hotspotData.createdAt = now;
      hotspotData.updatedAt = now;
    }

    const newHotspot = new Hotspot(hotspotData);
    const savedHotspot = await newHotspot.save();

    return c.json(savedHotspot);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching hotspot:", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspot" });
  }
});

export default getHotspot;
