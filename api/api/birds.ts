import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../lib/cors";

type Bird = {
  id: string;
  name: string;
  scientificName: string;
  family: string;
  habitat: string;
  imageUrl?: string;
};

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

function handler(request: VercelRequest, response: VercelResponse) {
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

export default withCors(handler, {
  methods: ["GET", "POST", "OPTIONS"],
});
