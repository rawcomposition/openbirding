import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { SQLiteHotspot } from "./types.js";

interface DatabaseSchema {
  hotspots: SQLiteHotspot;
}

const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({
    database: new (Database as any)("../openbirding.db"),
  }),
});

export default db;
