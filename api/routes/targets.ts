import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { withTargetsDb } from "../db/index.js";
import { requireTargetsDb } from "./targets-middleware.js";
import { executeH3TargetsQuery, executeLocationTargetsQuery, executeRegionTargetsQuery } from "./targets-queries.js";
import { isLocationId, parseH3Cells, parseMonthsBody, parseMonthsParam } from "./targets-validators.js";

const targetsRoute = new Hono();

targetsRoute.use("*", requireTargetsDb);

targetsRoute.get("/region/:regionCode", async (c) => {
  const regionCode = c.req.param("regionCode");
  const months = parseMonthsParam(c.req.query("months"));

  return c.json(await withTargetsDb((targetsDb) => executeRegionTargetsQuery(targetsDb, regionCode, months)));
});

targetsRoute.post("/h3", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Request body must be JSON" });
  });
  const cells = parseH3Cells(body.cells);
  const months = parseMonthsBody(body.months);

  return c.json(await withTargetsDb((targetsDb) => executeH3TargetsQuery(targetsDb, cells, months)));
});

targetsRoute.get("/location/:locationId", async (c) => {
  const locationId = c.req.param("locationId").trim().toUpperCase();
  if (!isLocationId(locationId)) {
    throw new HTTPException(400, { message: "locationId must look like L12345" });
  }

  return c.json(await withTargetsDb((targetsDb) => executeLocationTargetsQuery(targetsDb, locationId)));
});

export default targetsRoute;
