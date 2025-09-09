import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { syncPack, getPacksNeedingSync } from "../lib/ebird.js";
import db from "../lib/sqlite.js";

const DELAY = 5000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const packsRoute = new Hono();

packsRoute.get("/", async (c) => {
  try {
    const packs = await db
      .selectFrom("packs")
      .innerJoin("regions", "packs.region", "regions.id")
      .select(["packs.id", "packs.region", "packs.hotspots", "regions.name"])
      .orderBy("regions.name", "asc")
      .execute();

    return c.json({
      data: packs,
      count: packs.length,
    });
  } catch (error) {
    console.error("Get packs error:", error);
    throw new HTTPException(500, { message: error instanceof Error ? error.message : "Failed to get packs" });
  }
});

packsRoute.post("/sync/all", async (c) => {
  const key = c.req.query("key");
  const limit = c.req.query("limit");
  const authHeader = c.req.header("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  try {
    const limitNum = limit ? parseInt(limit) : 1000;
    if (isNaN(limitNum) || limitNum < 1) {
      throw new HTTPException(400, { message: "Limit must be a valid positive number" });
    }

    const packsToSync = await getPacksNeedingSync(limitNum);

    if (packsToSync.length === 0) {
      return c.json({
        success: true,
        message: "No packs need syncing at this time",
        totalPacks: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        totalInsertCount: 0,
        results: [],
      });
    }

    console.log(`Found ${packsToSync.length} packs that need syncing`);

    const results = [];
    let totalInsertCount = 0;

    for (const pack of packsToSync) {
      try {
        const result = await syncPack(pack.id);
        results.push({
          packId: pack.id,
          region: pack.region,
          success: true,
          message: result.message,
          insertCount: result.insertCount,
          updateCount: result.updateCount,
          deleteCount: result.deleteCount,
        });
        totalInsertCount += result.insertCount;

        console.log(
          `Synced pack ${pack.id} (${pack.region}): inserted ${result.insertCount}, updated ${result.updateCount}, deleted ${result.deleteCount}`
        );
      } catch (error: any) {
        console.error(`Error syncing pack ${pack.id} (${pack.region}):`, error.message);
        results.push({
          packId: pack.id,
          region: pack.region,
          success: false,
          error: error.message,
        });
      }

      if (pack !== packsToSync[packsToSync.length - 1]) {
        console.log(`Waiting ${DELAY / 1000} seconds before next pack...`);
        await delay(DELAY);
      }
    }

    const successfulSyncs = results.filter((r) => r.success).length;
    const failedSyncs = results.filter((r) => !r.success).length;

    return c.json({
      success: true,
      message: `Completed sync of ${packsToSync.length} packs. ${successfulSyncs} successful, ${failedSyncs} failed. Total new hotspots: ${totalInsertCount}`,
      totalPacks: packsToSync.length,
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

packsRoute.post("/sync/:packId", async (c) => {
  const key = c.req.query("key");
  const packId = c.req.param("packId");
  const authHeader = c.req.header("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  try {
    if (!packId) {
      throw new HTTPException(400, { message: "Pack ID parameter is required" });
    }

    const packIdNum = parseInt(packId);
    if (isNaN(packIdNum)) {
      throw new HTTPException(400, { message: "Pack ID must be a valid number" });
    }

    const result = await syncPack(packIdNum);
    return c.json(result);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Sync error:", error);
    throw new HTTPException(500, { message: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

export default packsRoute;
