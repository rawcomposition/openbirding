import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { setupDatabase } from "./db/index.js";
import packs from "./routes/packs.js";
import backups from "./routes/backups.js";
import reports from "./routes/reports.js";
import targets from "./routes/targets.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : [],
    credentials: true,
  })
);

app.route("/api/v1/packs", packs);
app.route("/api/v1/backups", backups);
app.route("/api/v1/reports", reports);
app.route("/api/v1/targets", targets);

app.notFound((c) => {
  return c.json({ message: "Not Found" }, 404);
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // If the exception has a custom response (e.g., basic auth), use it directly
    if (err.res) {
      return err.getResponse();
    }
    return c.json({ message: err.message }, err.status);
  }
  const message = err instanceof Error ? err.message : "Internal Server Error";
  return c.json({ message }, 500);
});

setupDatabase()
  .then(() => {
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
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });
