import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import hotspots from "./routes/hotspots.js";
import packs from "./routes/packs.js";
import regions from "./routes/regions.js";
import auth from "./routes/auth.js";
import backups from "./routes/backups.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : [],
    credentials: true,
  })
);

app.route("/api/hotspots", hotspots);
app.route("/api/packs", packs);
app.route("/api/regions", regions);
app.route("/api/auth", auth);
app.route("/api/backups", backups);

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
