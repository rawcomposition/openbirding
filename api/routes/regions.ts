import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "kysely";
import { db } from "../db/index.js";

const regionsRoute = new Hono();

regionsRoute.get("/", async (c) => {
  try {
    const rows = await db
      .selectFrom("regions")
      .select(["id", "name"])
      .execute();

    const regions = Object.fromEntries(rows.map((r) => [r.id, r.name]));

    return c.json(regions);
  } catch (error) {
    console.error("Get all regions error:", error);
    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
});

regionsRoute.get("/search", async (c) => {
  try {
    const query = c.req.query("q");
    if (!query || query.length < 2) {
      return c.json({ regions: [] });
    }

    // Escape FTS5 special characters and create prefix search term
    const escaped = query.replace(/['"*()]/g, "").trim();
    const ftsQuery = `"${escaped}"*`;

    const regions = await sql<{ id: string; name: string; longName: string }[]>`
      SELECT r.id, r.name, r.long_name as "longName"
      FROM regions_fts fts
      JOIN regions r ON r.rowid = fts.rowid
      WHERE regions_fts MATCH ${ftsQuery}
      ORDER BY r.level ASC, r.name ASC
      LIMIT 20
    `.execute(db);

    return c.json({ regions: regions.rows });
  } catch (error) {
    console.error("Region search error:", error);
    throw new HTTPException(500, {
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
});

export default regionsRoute;
