import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../lib/cors";
import { syncRegion } from "../lib/ebird";
import { syncRegions } from "../data/sync-regions";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    return response.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  const { key } = request.query;
  const authHeader = request.headers.authorization;

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
    return response.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  try {
    const results = [];
    let totalInsertCount = 0;

    for (const region of syncRegions) {
      console.log(`Starting sync for region: ${region}`);

      try {
        const result = await syncRegion(region);
        results.push({
          region,
          success: true,
          message: result.message,
          insertCount: result.insertCount,
        });
        totalInsertCount += result.insertCount;

        console.log(`Completed sync for ${region}: ${result.insertCount} new hotspots`);
      } catch (error: any) {
        console.error(`Error syncing region ${region}:`, error.message);
        results.push({
          region,
          success: false,
          error: error.message,
        });
      }

      if (region !== syncRegions[syncRegions.length - 1]) {
        console.log(`Waiting 5 seconds before next region...`);
        await delay(5000);
      }
    }

    const successfulSyncs = results.filter((r) => r.success).length;
    const failedSyncs = results.filter((r) => !r.success).length;

    response.status(200).json({
      success: true,
      message: `Completed sync of all regions. ${successfulSyncs} successful, ${failedSyncs} failed. Total new hotspots: ${totalInsertCount}`,
      totalRegions: syncRegions.length,
      successfulSyncs,
      failedSyncs,
      totalInsertCount,
      results,
    });
  } catch (error: any) {
    console.error("Sync all error:", error);
    response.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export default withCors(handler, {
  methods: ["POST", "OPTIONS"],
});
