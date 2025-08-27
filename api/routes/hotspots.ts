import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../lib/sqlite.js";
import { getCosLat, getDistanceKm, getRadiusSquared, makeBounds } from "lib/spatial.js";
import { sql } from "kysely";

const hotspots = new Hono();

hotspots.get("/within-bounds", async (c) => {
  try {
    const bounds = c.req.query("bounds");
    if (!bounds) throw new HTTPException(400, { message: "Bounds parameter is required" });

    const parts = bounds.split(",");
    if (parts.length !== 4) {
      throw new HTTPException(400, { message: "Bounds must be in format: west,south,east,north" });
    }

    const [west, south, east, north] = parts.map(Number);
    if ([west, south, east, north].some(Number.isNaN)) {
      throw new HTTPException(400, { message: "Bounds must be numeric: west,south,east,north" });
    }

    const rows = await db
      .selectFrom("hotspots as h")
      .innerJoin(sql`hotspots_rtree`.as("r"), (j) => j.on(sql.ref("r.rowId"), "=", sql.ref("h.rowId")))
      .select([
        "h.id as id",
        "h.name as name",
        "h.species as species",
        "h.open as open",
        "h.lat as lat",
        "h.lng as lng",
        "h.notes as notes",
      ])
      .where((eb) =>
        eb.and([
          sql<boolean>`${sql.ref("r.minLat")} <= ${north} AND ${sql.ref("r.maxLat")} >= ${south}`,
          sql<boolean>`${sql.ref("r.minLng")} <= ${east}  AND ${sql.ref("r.maxLng")} >= ${west}`,
        ])
      )
      .execute();

    const transformedHotspots = rows.map((r) => ({
      id: r.id,
      name: r.name,
      species: r.species,
      lat: r.lat,
      lng: r.lng,
      open: r.open === 1 ? true : r.open === 0 ? false : null,
      notes: r.notes,
    }));

    return c.json({ hotspots: transformedHotspots, count: transformedHotspots.length });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Error fetching hotspots by bounds (sqlite):", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspots by bounds" });
  }
});

hotspots.get("/by-region/:regionCode", async (c) => {
  try {
    const regionCode = c.req.param("regionCode");

    if (!regionCode) {
      throw new HTTPException(400, { message: "Region code is required" });
    }

    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "10000");
    const offset = (page - 1) * limit;

    const [hotspots, totalCount] = await Promise.all([
      db
        .selectFrom("hotspots")
        .select(["id", "name", "open", "notes", "species", "lng", "lat"])
        .where("region", "like", `${regionCode}%`)
        .orderBy("species", "desc")
        .limit(limit)
        .offset(offset)
        .execute(),
      db
        .selectFrom("hotspots")
        .select(db.fn.count("id").as("count"))
        .where("region", "like", `${regionCode}%`)
        .executeTakeFirst(),
    ]);

    const transformedHotspots = hotspots.map((hotspot) => ({
      id: hotspot.id,
      name: hotspot.name,
      species: hotspot.species,
      lat: hotspot.lat,
      lng: hotspot.lng,
      open: hotspot.open === 1 ? true : hotspot.open === 0 ? false : null,
      notes: hotspot.notes,
    }));

    const count = totalCount?.count || 0;

    return c.json({
      hotspots: transformedHotspots,
      count: Number(count),
      page,
      limit,
      totalPages: Math.ceil(Number(count) / limit),
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching hotspots by region:", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspots by region" });
  }
});

hotspots.get("/nearby/:coordinates", async (c) => {
  try {
    const { coordinates } = c.req.param();
    if (!coordinates) throw new HTTPException(400, { message: "Coordinates are required" });

    const [lat, lng] = coordinates.split(",").map(Number);
    if (isNaN(lat) || isNaN(lng)) throw new HTTPException(400, { message: "Invalid coordinates format" });

    const radiusKm = Number(c.req.query("radiusKm") ?? 200);
    const limit = Math.min(Number(c.req.query("limit") ?? 200), 1000);

    const cosLat0 = getCosLat(lat);
    const rSq = getRadiusSquared(radiusKm);
    const boxes = makeBounds(lat, lng, radiusKm);

    const distSq = sql<number>`
      (( (h.lng - ${lng}) * ${cosLat0} ) * ( (h.lng - ${lng}) * ${cosLat0} )
       + (h.lat - ${lat}) * (h.lat - ${lat}))
    `;

    const q = db
      .selectFrom("hotspots as h")
      .innerJoin(sql`hotspots_rtree`.as("r"), (join) => join.on(sql.ref("r.rowId"), "=", sql.ref("h.rowId")))
      .select([
        "h.id as id",
        "h.name as name",
        "h.species as species",
        "h.open as open",
        "h.notes as notes",
        "h.lat as lat",
        "h.lng as lng",
        distSq.as("distance_sq_deg"),
      ])
      .where((eb) =>
        eb.or(
          boxes.map((b) =>
            eb.and([
              sql<boolean>`r.minLat <= ${b.maxLat} AND r.maxLat >= ${b.minLat}`,
              sql<boolean>`r.minLng <= ${b.maxLng} AND r.maxLng >= ${b.minLng}`,
            ])
          )
        )
      )
      .where(distSq, "<=", rSq)
      .orderBy(distSq, "asc")
      .limit(limit);

    const rows = await q.execute();

    const transformedHotspots = rows.map((r) => ({
      id: r.id,
      name: r.name,
      species: r.species,
      lat: r.lat,
      lng: r.lng,
      open: r.open === 1 ? true : r.open === 0 ? false : null,
      notes: r.notes,
      distance: getDistanceKm(lat, lng, r.lat, r.lng),
    }));

    return c.json(transformedHotspots);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Error fetching hotspots near coordinates (sqlite):", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspots" });
  }
});

hotspots.put("/bulk-update", async (c) => {
  try {
    const updates = await c.req.json<Array<{ id: string; open?: boolean | null; notes?: string }>>();

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new HTTPException(400, { message: "Updates array is required and must not be empty" });
    }

    let updatedCount = 0;
    const currentTime = new Date().toISOString();

    await db.transaction().execute(async (trx) => {
      for (const update of updates) {
        const updateData = {
          updatedAt: currentTime,
          open: update.open === true ? 1 : update.open === false ? 0 : null,
          notes: update.notes || null,
        };

        const result = await trx.updateTable("hotspots").set(updateData).where("id", "=", update.id).executeTakeFirst();

        if (result.numUpdatedRows > 0) {
          updatedCount++;
        }
      }
    });

    return c.json({
      message: "Bulk update completed successfully",
      updatedCount,
      totalCount: updates.length,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error bulk updating hotspots:", error);
    throw new HTTPException(500, { message: "Failed to bulk update hotspots" });
  }
});

hotspots.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    if (!id) {
      throw new HTTPException(400, { message: "Hotspot ID is required" });
    }

    const hotspot = await db.selectFrom("hotspots").selectAll().where("id", "=", id).executeTakeFirst();

    if (!hotspot) {
      throw new HTTPException(404, { message: "Hotspot not found" });
    }

    const transformedHotspot = {
      id: hotspot.id,
      name: hotspot.name,
      region: hotspot.region,
      country: hotspot.country,
      state: hotspot.state,
      county: hotspot.county,
      species: hotspot.species,
      lat: hotspot.lat,
      lng: hotspot.lng,
      open: hotspot.open === 1 ? true : hotspot.open === 0 ? false : null,
      notes: hotspot.notes,
      createdAt: hotspot.createdAt,
      updatedAt: hotspot.updatedAt,
    };

    return c.json(transformedHotspot);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching hotspot:", error);
    throw new HTTPException(500, { message: "Failed to fetch hotspot" });
  }
});

export default hotspots;
