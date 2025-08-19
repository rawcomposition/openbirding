import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import hotspots from "./routes/hotspots.js";
import getHotspot from "./routes/get-hotspot.js";
import syncRegion from "./routes/sync-region.js";
import syncAllRegions from "./routes/sync-all-regions.js";
import search from "./routes/search.js";
import regions from "./routes/regions.js";

const app = new Hono();

if (process.env.CORS_ORIGINS) {
  app.use("*", cors({ origin: process.env.CORS_ORIGINS.split(",") }));
} else {
  console.error("CORS_ORIGINS is not set");
}

app.route("/api/hotspots", hotspots);
app.route("/api/get-hotspot", getHotspot);
app.route("/api/sync-region", syncRegion);
app.route("/api/sync-all-regions", syncAllRegions);
app.route("/api/search", search);
app.route("/api/regions", regions);

app.notFound((c) => {
  return c.json({ message: "Not Found" }, 404);
});

app.onError((err, c) => {
  const message = err instanceof Error ? err.message : "Internal Server Error";
  const status = err instanceof HTTPException ? err.status : 500;
  return c.json({ message }, status);
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
    hostname: "0.0.0.0",
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
