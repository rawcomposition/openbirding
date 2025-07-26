import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../lib/cors";
import { syncRegion } from "../lib/ebird";

async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    return response.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  const { key, region } = request.query;
  const authHeader = request.headers.authorization;

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
    return response.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  try {
    const result = await syncRegion(region as string);
    response.status(200).json(result);
  } catch (error: any) {
    console.error("Sync error:", error);
    response.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export default withCors(handler, {
  methods: ["POST", "OPTIONS"],
});
