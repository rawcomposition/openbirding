import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { withTargetsDb } from "../db/index.js";
import { requireTargetsDb } from "./targets-middleware.js";
import { executeHotspotsPostQuery, executeHotspotsQuery } from "./targets-queries.js";
import { isLocationId, parseBBoxBody, parseBBoxParam, parseLimit, parseLocationIds, parseMinCount, parseMinObservations, parseMonth } from "./targets-validators.js";

const hotspotsRoute = new Hono();

const BBOX_HOTSPOTS_MAX = 50000;
const HOTSPOT_CACHE_CONTROL = "public, max-age=86400";

hotspotsRoute.use("*", requireTargetsDb);

hotspotsRoute.get("/", async (c) => {
  const bbox = parseBBoxParam(c.req.query("bbox"));
  if (!bbox) {
    throw new HTTPException(400, { message: "bbox is required" });
  }
  const minChecklists = parseMinCount(c.req.query("minChecklists"), "minChecklists");
  const minSpecies = parseMinCount(c.req.query("minSpecies"), "minSpecies");

  const rows = await withTargetsDb((targetsDb) =>
    targetsDb
      .selectFrom("hotspots")
      .select(["id", "lat", "lng", "numSpecies"])
      .where("lat", ">=", bbox.minLat)
      .where("lat", "<=", bbox.maxLat)
      .where("lng", ">=", bbox.minLng)
      .where("lng", "<=", bbox.maxLng)
      .$if(minChecklists != null, (qb) => qb.where("numChecklists", ">=", minChecklists!))
      .$if(minSpecies != null, (qb) => qb.where("numSpecies", ">=", minSpecies!))
      .orderBy("numSpecies", "desc")
      .limit(BBOX_HOTSPOTS_MAX + 1)
      .execute()
  );

  if (rows.length > BBOX_HOTSPOTS_MAX) {
    throw new HTTPException(400, { message: `bbox contains more than ${BBOX_HOTSPOTS_MAX} hotspots — use a smaller area` });
  }

  c.header("Cache-Control", HOTSPOT_CACHE_CONTROL);
  return c.json({ items: rows.map((row) => [row.id, row.lat, row.lng, row.numSpecies] as const) });
});

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

  let sortBy: "best" | "frequency" | null = null;
  if (body.sortBy != null) {
    if (body.sortBy !== "best" && body.sortBy !== "frequency") {
      throw new HTTPException(400, { message: "sortBy must be 'best' or 'frequency'" });
    }
    sortBy = body.sortBy;
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
      sortBy,
    })
  ));
});

hotspotsRoute.get("/location/:id", async (c) => {
  const id = c.req.param("id").trim().toUpperCase();
  if (!isLocationId(id)) {
    throw new HTTPException(400, { message: "id must be a hotspot ID like L12345" });
  }

  const hotspot = await withTargetsDb((targetsDb) =>
    targetsDb
      .selectFrom("hotspots")
      .select(["id", "name", "countryCode", "subnational1Code", "subnational2Code", "regionCode", "lat", "lng", "numSpecies", "numChecklists"])
      .where("id", "=", id)
      .executeTakeFirst()
  );
  if (!hotspot) {
    throw new HTTPException(404, { message: "Hotspot not found" });
  }

  c.header("Cache-Control", HOTSPOT_CACHE_CONTROL);
  return c.json(hotspot);
});

export default hotspotsRoute;
