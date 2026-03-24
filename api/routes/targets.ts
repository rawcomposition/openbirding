import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { withTargetsDb } from "../db/index.js";
import { requireTargetsDb } from "./targets-middleware.js";
import { executeLocationTargetsQuery, executeRegionTargetsQuery } from "./targets-queries.js";
import { isLocationId, parseMonthsParam } from "./targets-validators.js";

const targetsRoute = new Hono();

targetsRoute.use("*", requireTargetsDb);

targetsRoute.get("/region/:regionCode", async (c) => {
  const regionCode = c.req.param("regionCode");
  const months = parseMonthsParam(c.req.query("months"));

  return c.json(await withTargetsDb((targetsDb) => executeRegionTargetsQuery(targetsDb, regionCode, months)));
});

targetsRoute.get("/location/:locationId", async (c) => {
  const locationId = c.req.param("locationId").trim().toUpperCase();
  if (!isLocationId(locationId)) {
    throw new HTTPException(400, { message: "locationId must look like L12345" });
  }

  return c.json(await withTargetsDb((targetsDb) => executeLocationTargetsQuery(targetsDb, locationId)));
});

export default targetsRoute;
