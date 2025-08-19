import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { syncRegion, getRegionsNeedingSync } from "../lib/ebird.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const syncAllRegions = new Hono();

syncAllRegions.post("/", async (c) => {
  const key = c.req.query("key");
  const authHeader = c.req.header("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  try {
    const regionsToSync = await getRegionsNeedingSync();

    if (regionsToSync.length === 0) {
      return c.json({
        success: true,
        message: "No regions need syncing at this time",
        totalRegions: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        totalInsertCount: 0,
        results: [],
      });
    }

    console.log(`Found ${regionsToSync.length} regions that need syncing`);

    const results = [];
    let totalInsertCount = 0;

    for (const region of regionsToSync) {
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

      if (region !== regionsToSync[regionsToSync.length - 1]) {
        console.log(`Waiting 10 seconds before next region...`);
        await delay(10000);
      }
    }

    const successfulSyncs = results.filter((r) => r.success).length;
    const failedSyncs = results.filter((r) => !r.success).length;

    return c.json({
      success: true,
      message: `Completed sync of ${regionsToSync.length} regions. ${successfulSyncs} successful, ${failedSyncs} failed. Total new hotspots: ${totalInsertCount}`,
      totalRegions: regionsToSync.length,
      successfulSyncs,
      failedSyncs,
      totalInsertCount,
      results,
    });
  } catch (error) {
    console.error("Sync all error:", error);
    throw new HTTPException(500, { message: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

export default syncAllRegions;
