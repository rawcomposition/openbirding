import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getTaxonomy } from "../lib/ebird.js";

const taxonomyRoute = new Hono();

taxonomyRoute.get("/", async (c) => {
  try {
    const taxonomy = await getTaxonomy();
    return c.json(taxonomy);
  } catch (error) {
    console.error("Taxonomy fetch error:", error);
    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
});

export default taxonomyRoute;
