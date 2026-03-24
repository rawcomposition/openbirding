import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { withTargetsDb } from "../db/index.js";
import { requireTargetsDb } from "./targets-middleware.js";
import { executeHotspotsQuery } from "./targets-queries.js";
import { parseBBoxBody, parseBBoxParam, parseLimit, parseLocationIds, parseMinObservations, parseMonth } from "./targets-validators.js";

const hotspotsRoute = new Hono();

hotspotsRoute.use("*", requireTargetsDb);

hotspotsRoute.get("/species/:speciesCode", async (c) => {
  const speciesCode = c.req.param("speciesCode").trim().toLowerCase();

  return c.json(await withTargetsDb((targetsDb) =>
    executeHotspotsQuery(targetsDb, {
      speciesCode,
      region: c.req.query("region") ?? null,
      limit: parseLimit(c.req.query("limit")),
      month: parseMonth(c.req.query("month")),
      minObservations: parseMinObservations(c.req.query("minObservations")),
      bbox: parseBBoxParam(c.req.query("bbox")),
      locationIds: null,
    })
  ));
});

hotspotsRoute.post("/species/:speciesCode", async (c) => {
  const speciesCode = c.req.param("speciesCode").trim().toLowerCase();

  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch {
    throw new HTTPException(400, { message: "Request body must be valid JSON" });
  }

  return c.json(await withTargetsDb((targetsDb) =>
    executeHotspotsQuery(targetsDb, {
      speciesCode,
      region: typeof body.region === "string" ? body.region : null,
      limit: parseLimit(body.limit as string | number | undefined | null),
      month: parseMonth(body.month as string | number | undefined | null),
      minObservations: parseMinObservations(body.minObservations as string | number | undefined | null),
      bbox: parseBBoxBody(body.bbox),
      locationIds: parseLocationIds(body.locationIds),
    })
  ));
});

export default hotspotsRoute;
