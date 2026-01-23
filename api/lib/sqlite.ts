import Database from "better-sqlite3";
import { Kysely, SqliteDialect, CamelCasePlugin, sql } from "kysely";
import type { Pack, Region, Cluster, PackDownload } from "./types.js";

type DatabaseSchema = {
  packs: Pack;
  clusters: Cluster;
  regions: Region;
  packDownloads: PackDownload;
};

const sqliteDb = new (Database as any)(process.env.SQLITE_PATH);

if (!sqliteDb) {
  throw new Error("Failed to connect to SQLite database");
}

sqliteDb.pragma("foreign_keys = ON");

const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({
    database: sqliteDb,
  }),
  plugins: [new CamelCasePlugin()],
});

export async function setupDatabase() {
  await db.schema
    .createTable("packs")
    .ifNotExists()
    .addColumn("id", "integer", (c) => c.primaryKey())
    .addColumn("region", "text", (c) => c.notNull().unique())
    .addColumn("hotspots", "integer")
    .addColumn("last_synced", "text")
    .addColumn("min_x", "real")
    .addColumn("min_y", "real")
    .addColumn("max_x", "real")
    .addColumn("max_y", "real")
    .addColumn("center_lat", "real")
    .addColumn("center_lng", "real")
    .addColumn("has_custom_center", "integer")
    .addForeignKeyConstraint("fk_packs_region", ["region"], "regions", ["id"], (cb) => cb.onDelete("cascade"))
    .execute();

  await db.schema
    .createTable("clusters")
    .ifNotExists()
    .addColumn("pack_id", "integer", (c) => c.notNull())
    .addColumn("lat", "real", (c) => c.notNull())
    .addColumn("lng", "real", (c) => c.notNull())
    .addColumn("count", "integer", (c) => c.notNull().defaultTo(0))
    .addCheckConstraint("chk_cluster_lat", sql`lat BETWEEN -90 AND 90`)
    .addCheckConstraint("chk_cluster_lng", sql`lng BETWEEN -180 AND 180`)
    .addForeignKeyConstraint("fk_clusters_pack", ["pack_id"], "packs", ["id"], (cb) => cb.onDelete("cascade"))
    .execute();

  await db.schema
    .createTable("regions")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("long_name", "text")
    .addColumn("parents", "text")
    .addColumn("level", "integer", (c) => c.notNull().check(sql`level IN (1, 2, 3)`))
    .addColumn("has_children", "integer")
    .execute();

  await db.schema
    .createTable("pack_downloads")
    .ifNotExists()
    .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
    .addColumn("pack_id", "integer", (c) => c.notNull())
    .addColumn("pack_region", "text", (c) => c.notNull())
    .addColumn("method", "text")
    .addColumn("app_version", "text")
    .addColumn("app_platform", "text")
    .addColumn("app_environment", "text")
    .addColumn("user_agent", "text")
    .addColumn("created_at", "text", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addForeignKeyConstraint("fk_pack_downloads_pack", ["pack_id"], "packs", ["id"], (cb) => cb.onDelete("cascade"))
    .execute();

  console.log("Database setup complete");
}

export default db;
