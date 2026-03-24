import { Hono } from "hono";
import { sql } from "kysely";
import { withTargetsDb } from "../db/index.js";
import { requireTargetsDb } from "./targets-middleware.js";

const speciesRoute = new Hono();

speciesRoute.use("*", requireTargetsDb);

speciesRoute.get("/search", async (c) => {
  const query = c.req.query("q");
  if (!query || query.trim().length < 2) {
    return c.json({ species: [] });
  }

  const escaped = query.replace(/['"*()]/g, "").trim();
  if (escaped.length < 2) {
    return c.json({ species: [] });
  }

  const ftsQuery = `"${escaped}"*`;
  const result = await withTargetsDb((targetsDb) =>
    sql<{ code: string; name: string; sciName: string }[]>`
      SELECT s.code, s.name, s.sci_name as "sciName"
      FROM species_fts fts
      JOIN species s ON s.id = fts.rowid
      WHERE species_fts MATCH ${ftsQuery}
      ORDER BY s.taxon_order ASC
      LIMIT 20
    `.execute(targetsDb)
  );

  return c.json({ species: result.rows });
});

export default speciesRoute;
