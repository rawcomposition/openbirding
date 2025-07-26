import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../lib/cors";
import connect from "../lib/db";
import Hotspot from "../models/Hotspot";

async function getHotspots(request: VercelRequest, response: VercelResponse) {
  try {
    await connect();

    const page = parseInt(request.query.page as string) || 1;
    const limit = parseInt(request.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const [hotspots, totalCount] = await Promise.all([
      Hotspot.find({}).sort({ species: -1 }).skip(skip).limit(limit).lean(),
      Hotspot.countDocuments({}),
    ]);

    response.status(200).json({
      hotspots,
      count: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error("Error fetching hotspots:", error);
    response.status(500).json({
      error: "Failed to fetch hotspots",
    });
  }
}

function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method === "GET") {
    return getHotspots(request, response);
  }

  response.status(405).json({
    error: "Method not allowed",
  });
}

export default withCors(handler);
