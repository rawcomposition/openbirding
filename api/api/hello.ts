import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../lib/cors";

function handler(request: VercelRequest, response: VercelResponse) {
  response.status(200).json({
    message: "Hello from OpenBirding API!",
    timestamp: new Date().toISOString(),
  });
}

export default withCors(handler, {
  methods: ["GET", "OPTIONS"],
});
