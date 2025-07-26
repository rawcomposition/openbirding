import type { VercelRequest, VercelResponse } from "@vercel/node";

interface Bird {
  id: string;
  name: string;
  scientificName: string;
  family: string;
  habitat: string;
  imageUrl?: string;
}

const sampleBirds: Bird[] = [
  {
    id: "1",
    name: "American Robin",
    scientificName: "Turdus migratorius",
    family: "Turdidae",
    habitat: "Woodlands, gardens, and urban areas",
  },
  {
    id: "2",
    name: "Northern Cardinal",
    scientificName: "Cardinalis cardinalis",
    family: "Cardinalidae",
    habitat: "Woodlands, gardens, and shrublands",
  },
  {
    id: "3",
    name: "Blue Jay",
    scientificName: "Cyanocitta cristata",
    family: "Corvidae",
    habitat: "Forests, woodlands, and urban areas",
  },
];

export default function handler(request: VercelRequest, response: VercelResponse) {
  // Add CORS headers
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    response.status(200).end();
    return;
  }

  if (request.method === "GET") {
    response.status(200).json({
      birds: sampleBirds,
      count: sampleBirds.length,
    });
    return;
  }

  if (request.method === "POST") {
    const newBird: Bird = request.body;

    if (!newBird.name || !newBird.scientificName) {
      response.status(400).json({
        error: "Name and scientific name are required",
      });
      return;
    }

    const birdWithId: Bird = {
      ...newBird,
      id: Date.now().toString(),
    };

    response.status(201).json(birdWithId);
    return;
  }

  response.status(405).json({
    error: "Method not allowed",
  });
}
