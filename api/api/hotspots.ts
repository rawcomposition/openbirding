import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../lib/cors";

type Hotspot = {
  id: string;
  name: string;
  location: string;
  description: string;
  habitat: string;
  imageUrl?: string;
};

const sampleHotspots: Hotspot[] = [
  {
    id: "1",
    name: "Central Park",
    location: "New York, NY",
    description: "Famous urban birding location with diverse habitats",
    habitat: "Urban park with lakes, woodlands, and meadows",
  },
  {
    id: "2",
    name: "Jamaica Bay Wildlife Refuge",
    location: "Queens, NY",
    description: "Coastal wetland teeming with migratory birds",
    habitat: "Coastal wetlands, marshes, and open water",
  },
  {
    id: "3",
    name: "Prospect Park",
    location: "Brooklyn, NY",
    description: "Brooklyn's premier birding destination",
    habitat: "Urban park with woodlands, lakes, and meadows",
  },
];

function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method === "GET") {
    response.status(200).json({
      hotspots: sampleHotspots,
      count: sampleHotspots.length,
    });
    return;
  }

  if (request.method === "POST") {
    const newHotspot: Hotspot = request.body;

    if (!newHotspot.name || !newHotspot.location) {
      response.status(400).json({
        error: "Name and location are required",
      });
      return;
    }

    const hotspotWithId: Hotspot = {
      ...newHotspot,
      id: Date.now().toString(),
    };

    response.status(201).json(hotspotWithId);
    return;
  }

  response.status(405).json({
    error: "Method not allowed",
  });
}

export default withCors(handler, {
  methods: ["GET", "POST", "OPTIONS"],
});
