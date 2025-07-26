import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../lib/cors";
import connect from "../lib/db";
import Hotspot, { Hotspot as HotspotType } from "../models/Hotspot";

function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method === "GET") {
    return getHotspots(request, response);
  }

  if (request.method === "POST") {
    return createHotspot(request, response);
  }

  response.status(405).json({
    error: "Method not allowed",
  });
}

async function getHotspots(request: VercelRequest, response: VercelResponse) {
  try {
    await connect();
    const hotspots = await Hotspot.find({}).sort({ createdAt: -1 });

    response.status(200).json({
      hotspots,
      count: hotspots.length,
    });
  } catch (error) {
    response.status(500).json({
      error: "Failed to fetch hotspots",
    });
  }
}

async function createHotspot(request: VercelRequest, response: VercelResponse) {
  try {
    const { _id, name, lat, lng, country, state, county, species } = request.body;

    if (!_id || !name || lat === undefined || lng === undefined || !country || !state || !county) {
      response.status(400).json({
        error: "Missing required fields: _id, name, lat, lng, country, state, county",
      });
      return;
    }

    await connect();

    const existingHotspot = await Hotspot.findById(_id);
    if (existingHotspot) {
      response.status(409).json({
        error: "Hotspot with this ID already exists",
      });
      return;
    }

    const newHotspot = new Hotspot({
      _id,
      name,
      lat,
      lng,
      country,
      state,
      county,
      species: species || 0,
    });

    const savedHotspot = await newHotspot.save();
    response.status(201).json(savedHotspot);
  } catch (error) {
    response.status(500).json({
      error: "Failed to create hotspot",
    });
  }
}

export default withCors(handler, {
  methods: ["GET", "POST", "OPTIONS"],
});
