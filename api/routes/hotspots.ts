import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { withTargetsDb } from "../db/index.js";
import { requireTargetsDb } from "./targets-middleware.js";
import { executeHotspotsPostQuery, executeHotspotsQuery } from "./targets-queries.js";
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
      months: (() => {
        const month = parseMonth(c.req.query("month"));
        return month != null ? [month] : null;
      })(),
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

  if (body.month != null) {
    throw new HTTPException(400, { message: "months must be an array of values between 1 and 12" });
  }
  let months: number[] | null = null;
  if (body.months != null) {
    if (!Array.isArray(body.months)) {
      throw new HTTPException(400, { message: "months must be an array of values between 1 and 12" });
    }

    months = [...new Set(body.months.map(Number))].sort((a, b) => a - b);
    if (months.length === 0 || months.some((month) => !Number.isInteger(month) || month < 1 || month > 12)) {
      throw new HTTPException(400, { message: "months must be an array of values between 1 and 12" });
    }
  }

  return c.json(await withTargetsDb((targetsDb) =>
    executeHotspotsPostQuery(targetsDb, {
      speciesCode,
      region: typeof body.region === "string" ? body.region : null,
      limit: parseLimit(body.limit as string | number | undefined | null),
      months,
      minObservations: parseMinObservations(body.minObservations as string | number | undefined | null),
      bbox: parseBBoxBody(body.bbox),
      locationIds: parseLocationIds(body.locationIds),
    })
  ));
});

export default hotspotsRoute;
