import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import connect from "../lib/db.js";
import Region from "../models/Region.js";
import Hotspot from "../models/Hotspot.js";
import db from "../lib/sqlite.js";

const regions = new Hono();

regions.get("/:regionCode", async (c) => {
  try {
    const regionCode = c.req.param("regionCode");

    if (!regionCode) {
      throw new HTTPException(400, { message: "Region code is required" });
    }

    let region;

    if (regionCode === "world") {
      region = {
        id: "world",
        name: "World",
        longName: "World",
        parents: [],
        isCountry: false,
        hasChildren: true,
      };
    } else {
      region = await db.selectFrom("regions").selectAll().where("id", "=", regionCode).executeTakeFirst();

      if (!region) {
        throw new HTTPException(404, { message: "Region not found" });
      }

      region = {
        id: region.id,
        name: region.name,
        longName: region.longName,
        parents: region.parents ? JSON.parse(region.parents) : [],
        isCountry: region.level === 1,
        hasChildren: Boolean(region.hasChildren),
      };
    }

    return c.json(region);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching region:", error);
    throw new HTTPException(500, { message: "Failed to fetch region" });
  }
});

regions.get("/:regionCode/subregions", async (c) => {
  try {
    const regionCode = c.req.param("regionCode");

    if (!regionCode) {
      throw new HTTPException(400, { message: "Region code is required" });
    }

    let region;

    if (regionCode === "world") {
      region = {
        id: "world",
        name: "World",
        longName: "World",
        parents: null,
        level: 0,
        hasChildren: 1,
      };
    } else {
      region = await db.selectFrom("regions").selectAll().where("id", "=", regionCode).executeTakeFirst();

      if (!region) {
        throw new HTTPException(404, { message: "Region not found" });
      }
    }

    let subregions;

    if (regionCode === "world") {
      subregions = await db.selectFrom("regions").selectAll().where("level", "=", 1).execute();
    } else {
      const regionParts = regionCode.split("-");
      const nextLevel = regionParts.length + 1;

      subregions = await db
        .selectFrom("regions")
        .selectAll()
        .where("level", "=", nextLevel)
        .where("id", "like", `${regionCode}-%`)
        .where("id", "not like", `${regionCode}-%-%`)
        .execute();
    }

    const subregionIds = subregions.map((r) => r.id);

    let hotspotStats;

    if (regionCode === "world") {
      hotspotStats = await db
        .selectFrom("hotspots")
        .select([
          "country",
          db.fn.count("id").as("totalCount"),
          db.fn.sum("open").as("openCount"),
          db.fn.count("open").as("reviewedCount"),
        ])
        .where("country", "is not", null)
        .groupBy("country")
        .execute();
    } else {
      const regionParts = regionCode.split("-");
      const level = regionParts.length;

      if (level === 1) {
        hotspotStats = await db
          .selectFrom("hotspots")
          .select([
            "state",
            db.fn.count("id").as("totalCount"),
            db.fn.sum("open").as("openCount"),
            db.fn.count("open").as("reviewedCount"),
          ])
          .where("country", "=", regionCode)
          .where("state", "is not", null)
          .groupBy("state")
          .execute();
      } else if (level === 2) {
        hotspotStats = await db
          .selectFrom("hotspots")
          .select([
            "county",
            db.fn.count("id").as("totalCount"),
            db.fn.sum("open").as("openCount"),
            db.fn.count("open").as("reviewedCount"),
          ])
          .where("state", "=", regionCode)
          .where("county", "is not", null)
          .groupBy("county")
          .execute();
      }
    }

    const statsMap = new Map();

    if (hotspotStats) {
      for (const stat of hotspotStats) {
        let key: string | null = null;

        if (regionCode === "world" && "country" in stat) {
          key = stat.country;
        } else if (regionCode.split("-").length === 1 && "state" in stat) {
          key = stat.state;
        } else if (regionCode.split("-").length === 2 && "county" in stat) {
          key = stat.county;
        }

        if (key) {
          statsMap.set(key, {
            total: Number(stat.totalCount),
            open: Number(stat.openCount || 0),
            reviewed: Number(stat.reviewedCount),
          });
        }
      }
    }

    const subregionsWithHotspots = subregions.map((subregion) => ({
      _id: subregion.id,
      name: subregion.name,
      longName: subregion.longName,
      parents: subregion.parents ? JSON.parse(subregion.parents) : [],
      isCountry: subregion.level === 1,
      hasChildren: Boolean(subregion.hasChildren),
      hotspotCount: statsMap.get(subregion.id)?.total || 0,
      openHotspotCount: statsMap.get(subregion.id)?.open || 0,
      reviewedHotspotCount: statsMap.get(subregion.id)?.reviewed || 0,
    }));

    return c.json(subregionsWithHotspots);
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching subregions:", error);
    throw new HTTPException(500, { message: "Failed to fetch subregions" });
  }
});

regions.get("/:regionCode/stats", async (c) => {
  try {
    const regionCode = c.req.param("regionCode");

    if (!regionCode) {
      throw new HTTPException(400, { message: "Region code is required" });
    }

    await connect();

    let hotspotStats;

    if (regionCode === "world") {
      hotspotStats = await Hotspot.aggregate([
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            openCount: {
              $sum: {
                $cond: [{ $eq: ["$open", true] }, 1, 0],
              },
            },
            reviewedCount: {
              $sum: {
                $cond: [{ $ne: ["$open", null] }, 1, 0],
              },
            },
          },
        },
      ]);
    } else {
      hotspotStats = await Hotspot.aggregate([
        {
          $match: {
            region: { $regex: `^${regionCode}` },
          },
        },
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            openCount: {
              $sum: {
                $cond: [{ $eq: ["$open", true] }, 1, 0],
              },
            },
            reviewedCount: {
              $sum: {
                $cond: [{ $ne: ["$open", null] }, 1, 0],
              },
            },
          },
        },
      ]);
    }

    const stats = hotspotStats[0] || { totalCount: 0, openCount: 0, reviewedCount: 0 };

    return c.json({
      hotspotCount: stats.totalCount,
      openHotspotCount: stats.openCount,
      reviewedHotspotCount: stats.reviewedCount,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching region stats:", error);
    throw new HTTPException(500, { message: "Failed to fetch region stats" });
  }
});

export default regions;
