import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getHotspotsForRegion } from "../lib/ebird.js";
import db from "../db/index.js";
const packsRoute = new Hono();

// Legacy route
packsRoute.get("/", async (c) => {
  try {
    const packs = await db
      .selectFrom("packs")
      .innerJoin("regions", "packs.region", "regions.id")
      .select(["packs.id", "packs.hotspots", "regions.longName", "packs.region", "packs.centerLat", "packs.centerLng"])
      .orderBy("regions.longName", "asc")
      .execute();

    const clusters = await db.selectFrom("clusters").select(["packId", "lat", "lng"]).execute();

    return c.json(
      packs.map(({ longName, centerLat, centerLng, ...pack }) => ({
        ...pack,
        name: longName,
        lat: centerLat,
        lng: centerLng,
        clusters: clusters.filter((cluster) => cluster.packId === pack.id).map((cluster) => [cluster.lat, cluster.lng]),
      }))
    );
  } catch (error) {
    console.error("Get packs error:", error);
    throw new HTTPException(500, { message: error instanceof Error ? error.message : "Failed to get packs" });
  }
});

// Legacy route
packsRoute.get("/:id", async (c) => {
  try {
    const packId = c.req.param("id");

    if (!packId) {
      throw new HTTPException(400, { message: "Pack ID parameter is required" });
    }

    const packIdNum = parseInt(packId);
    if (isNaN(packIdNum)) {
      throw new HTTPException(400, { message: "Pack ID must be a valid number" });
    }

    const pack = await db.selectFrom("packs").select(["id", "region"]).where("id", "=", packIdNum).executeTakeFirst();

    if (!pack) {
      throw new HTTPException(404, { message: "Pack not found" });
    }

    const appVersion = c.req.header("App-Version") || null;
    const appPlatform = c.req.header("App-Platform") || null;
    const appEnvironment = c.req.header("App-Environment") || null;
    const method = c.req.header("Download-Method") || null;
    const userAgent = c.req.header("User-Agent") || null;

    await db
      .insertInto("packDownloads")
      .values({
        packId: pack.id,
        packRegion: pack.region,
        method,
        appVersion,
        appPlatform,
        appEnvironment,
        userAgent,
      })
      .execute();

    const [hotspots] = await Promise.all([getHotspotsForRegion(pack.region)]);

    const regionCodes = new Set<string>();
    hotspots.forEach((hotspot) => {
      if (hotspot.countryCode) regionCodes.add(hotspot.countryCode);
      if (hotspot.subnational1Code) regionCodes.add(hotspot.subnational1Code);
      if (hotspot.subnational2Code) regionCodes.add(hotspot.subnational2Code);
    });

    const regions = await db
      .selectFrom("regions")
      .select(["id", "name"])
      .where("id", "in", Array.from(regionCodes))
      .execute();

    const regionMap = new Map<string, string>();
    regions.forEach((region) => {
      if (!region.name) return;
      regionMap.set(region.id, region.name);
    });

    const transformedHotspots = hotspots.map((hotspot) => ({
      id: hotspot.locationId,
      name: hotspot.name,
      species: hotspot.total,
      lat: hotspot.lat,
      lng: hotspot.lng,
      country: hotspot.countryCode || null,
      state: hotspot.subnational1Code || null,
      county: hotspot.subnational2Code || null,
      countryName: regionMap.get(hotspot.countryCode) || hotspot.countryCode || null,
      stateName: regionMap.get(hotspot.subnational1Code) || hotspot.subnational1Code || null,
      countyName: regionMap.get(hotspot.subnational2Code) || hotspot.subnational2Code || null,
    }));

    return c.json({ hotspots: transformedHotspots });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Download pack error:", error);
    throw new HTTPException(500, { message: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

packsRoute.post("/:id/log-download", async (c) => {
  try {
    const packId = c.req.param("id");

    if (!packId) {
      throw new HTTPException(400, { message: "Pack ID parameter is required" });
    }

    const packIdNum = parseInt(packId);
    if (isNaN(packIdNum)) {
      throw new HTTPException(400, { message: "Pack ID must be a valid number" });
    }

    const pack = await db.selectFrom("packs").select(["id", "region"]).where("id", "=", packIdNum).executeTakeFirst();

    if (!pack) {
      throw new HTTPException(404, { message: "Pack not found" });
    }

    const appVersion = c.req.header("App-Version") || null;
    const appPlatform = c.req.header("App-Platform") || null;
    const appEnvironment = c.req.header("App-Environment") || null;
    const method = c.req.header("Download-Method") || null;
    const userAgent = c.req.header("User-Agent") || null;

    await db
      .insertInto("packDownloads")
      .values({
        packId: pack.id,
        packRegion: pack.region,
        method,
        appVersion,
        appPlatform,
        appEnvironment,
        userAgent,
      })
      .execute();

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Log pack download error:", error);
    throw new HTTPException(500, { message: error instanceof Error ? error.message : "Internal Server Error" });
  }
});

export default packsRoute;
