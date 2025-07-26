import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../../lib/cors";
import connect from "../../lib/db";
import Hotspot from "../../models/Hotspot";

type UpdateHotspotData = {
  tags?: string[];
};

async function updateHotspot(request: VercelRequest, response: VercelResponse) {
  try {
    const { id } = request.query;
    const updateData: UpdateHotspotData = request.body;

    if (!id || typeof id !== "string") {
      response.status(400).json({
        error: "Hotspot ID is required",
      });
      return;
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
      response.status(404).json({
        error: "Hotspot not found",
      });
      return;
    }

    response.status(200).json(updatedHotspot);
  } catch (error) {
    console.error("Error updating hotspot:", error);
    response.status(500).json({
      error: "Failed to update hotspot",
    });
  }
}

async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method === "PUT") {
    return updateHotspot(request, response);
  }

  response.status(405).json({ error: "Method not allowed" });
}

export default withCors(handler);
