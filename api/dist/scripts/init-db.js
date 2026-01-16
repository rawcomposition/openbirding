import "dotenv/config";
import { sql } from "kysely";
import db from "../lib/sqlite.js";
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
        .addCheckConstraint("chk_cluster_lat", sql `lat BETWEEN -90 AND 90`)
        .addCheckConstraint("chk_cluster_lng", sql `lng BETWEEN -180 AND 180`)
        .addForeignKeyConstraint("fk_clusters_pack", ["pack_id"], "packs", ["id"], (cb) => cb.onDelete("cascade"))
        .execute();
    await db.schema
        .createTable("regions")
        .ifNotExists()
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("long_name", "text")
        .addColumn("parents", "text")
        .addColumn("level", "integer", (c) => c.notNull().check(sql `level IN (1, 2, 3)`))
        .addColumn("has_children", "integer")
        .execute();
    console.log("Database setup complete");
}
setupDatabase().catch((error) => {
    console.error("Error setting up database:", error);
    process.exit(1);
});
