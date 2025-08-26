import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { Hotspot, Pack } from "./types.js";

type DatabaseSchema = {
  hotspots: Hotspot;
  packs: Pack;
  hotspots_rtree: { rowId: number; minLat: number; maxLat: number; minLng: number; maxLng: number };
};

const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({
    database: new (Database as any)("../openbirding.db"),
  }),
});

export default db;
