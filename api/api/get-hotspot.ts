import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../lib/cors";
import connect from "../lib/db";
import Hotspot from "../models/Hotspot";
import type { Hotspot as HotspotType } from "../lib/types";

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

function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method === "GET") {
    return getHotspot(request, response);
  }

  response.status(405).json({
    error: "Method not allowed",
  });
}

async function getHotspot(request: VercelRequest, response: VercelResponse) {
  try {
    const { locationId } = request.query;

    if (!locationId || typeof locationId !== "string") {
      response.status(400).json({
        error: "Location ID is required",
      });
      return;
    }

    const ebirdApiKey = process.env.EBIRD_API_KEY;
    if (!ebirdApiKey) {
      response.status(500).json({
        error: "eBird API key not configured",
      });
      return;
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
        response.status(200).json(mongoHotspot);
        return;
      }

      response.status(404).json({
        error: "Hotspot not found in eBird or local database",
      });
      return;
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

    response.status(200).json(savedHotspot);
  } catch (error) {
    console.error("Error fetching hotspot:", error);
    response.status(500).json({
      error: "Failed to fetch hotspot",
    });
  }
}

export default withCors(handler, {
  methods: ["GET", "OPTIONS"],
});
