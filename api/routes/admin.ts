import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { swapTargetsDb } from "../db/index.js";
import { swapOccurrencesDb } from "../lib/lifers-index.js";

const adminRoute = new Hono();

adminRoute.use(async (c, next) => {
  const key = c.req.query("key");
  const authHeader = c.req.header("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  await next();
});

adminRoute.post("/swap-targets-db", async (c) => {
  const result = await swapTargetsDb();
  if (!result.ok) {
    return c.json(result, 400);
  }
  return c.json(result);
});

adminRoute.post("/swap-occurrences-db", async (c) => {
  const result = await swapOccurrencesDb();
  if (!result.ok) {
    return c.json(result, 400);
  }
  return c.json(result);
});

export default adminRoute;
