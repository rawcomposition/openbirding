import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { syncRegion } from "../lib/ebird.js";

const syncRegionRoute = new Hono();

syncRegionRoute.post("/", async (c) => {
  const key = c.req.query("key");
  const region = c.req.query("region");
  const authHeader = c.req.header("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  try {
    if (!region) {
      throw new HTTPException(400, { message: "Region parameter is required" });
    }

    const result = await syncRegion(region);
    return c.json(result);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Sync error:", error);
    throw new HTTPException(500, { message: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

export default syncRegionRoute;
