import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import connect from "../lib/db.js";
import Region from "../models/Region.js";

const search = new Hono();

search.get("/", async (c) => {
  try {
    const query = c.req.query("q");

    if (!query || query.trim().length === 0) {
      return c.json({ results: [] });
    }

    await connect();

    const searchTerm = query.trim();
    const regex = new RegExp(searchTerm, "i");

    const regions = await Region.find({ longName: regex }).limit(10).lean().exec();

    const results = regions.map((region) => ({
      value: `/region/${region._id}`,
      label: region.longName,
    }));

    return c.json({ results });
  } catch (error) {
    console.error("Error searching:", error);
    throw new HTTPException(500, { message: "Failed to search" });
  }
});

export default search;
