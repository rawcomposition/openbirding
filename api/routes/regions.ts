import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import connect from "../lib/db.js";
import Region from "../models/Region.js";
import Hotspot from "../models/Hotspot.js";

const regions = new Hono();

regions.get("/:regionCode", async (c) => {
  try {
    const regionCode = c.req.param("regionCode");

    if (!regionCode) {
      throw new HTTPException(400, { message: "Region code is required" });
    }

    await connect();

    const region = await Region.findById(regionCode).lean();

    if (!region) {
      throw new HTTPException(404, { message: "Region not found" });
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

regions.get("/:regionCode/hotspots", async (c) => {
  try {
    const regionCode = c.req.param("regionCode");

    if (!regionCode) {
      throw new HTTPException(400, { message: "Region code is required" });
    }

    await connect();

    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "50000");
    const skip = (page - 1) * limit;
    const [hotspots, totalCount] = await Promise.all([
      Hotspot.find({ region: { $regex: `^${regionCode}` } }, { name: 1, open: 1, notes: 1, species: 1, location: 1 })
        .sort({ species: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Hotspot.countDocuments({ region: { $regex: `^${regionCode}` } }),
    ]);

    return c.json({
      hotspots,
      count: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("Error fetching region hotspots:", error);
    throw new HTTPException(500, { message: "Failed to fetch region hotspots" });
  }
});

regions.get("/:regionCode/subregions", async (c) => {
  try {
    const regionCode = c.req.param("regionCode");

    if (!regionCode) {
      throw new HTTPException(400, { message: "Region code is required" });
    }

    await connect();

    const region = await Region.findById(regionCode).lean();

    if (!region) {
      throw new HTTPException(404, { message: "Region not found" });
    }

    const subregions = await Region.find({
      _id: { $regex: `^${regionCode}-[^-]+$` },
    }).lean();

    const subregionIds = subregions.map((r) => r._id);

    const hotspotStats = await Hotspot.aggregate([
      {
        $match: {
          region: { $in: subregionIds },
        },
      },
      {
        $group: {
          _id: "$region",
          totalCount: { $sum: 1 },
          openCount: {
            $sum: {
              $cond: [{ $eq: ["$open", true] }, 1, 0],
            },
          },
        },
      },
    ]);

    const statsMap = new Map(hotspotStats.map((stat) => [stat._id, { total: stat.totalCount, open: stat.openCount }]));

    const subregionsWithHotspots = subregions.map((subregion) => ({
      ...subregion,
      hotspotCount: statsMap.get(subregion._id)?.total || 0,
      openHotspotCount: statsMap.get(subregion._id)?.open || 0,
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

export default regions;
