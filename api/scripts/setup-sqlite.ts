import { sql } from "kysely";
import db from "../lib/sqlite.js";

export async function setupDatabase() {
  await db.schema
    .createTable("hotspots")
    .ifNotExists()
    .addColumn("rowId", "integer", (c) => c.primaryKey())
    .addColumn("id", "text", (c) => c.notNull().unique())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("region", "text", (c) => c.notNull())
    .addColumn("country", "text")
    .addColumn("state", "text")
    .addColumn("county", "text")
    .addColumn("species", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("lat", "real", (c) => c.notNull())
    .addColumn("lng", "real", (c) => c.notNull())
    .addColumn("open", "integer")
    .addColumn("notes", "text")
    .addColumn("createdAt", "text", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "text", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addCheckConstraint("chk_lat", sql`lat BETWEEN -90 AND 90`)
    .addCheckConstraint("chk_lng", sql`lng BETWEEN -180 AND 180`)
    .addCheckConstraint("chk_open_bool", sql`open IN (0,1) OR open IS NULL`)
    .execute();

  await db.schema
    .createIndex("hotspots_region_species_idx")
    .ifNotExists()
    .on("hotspots")
    .columns(["region", "species"])
    .execute();

  await db.executeQuery(
    sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS hotspots_rtree
    USING rtree(
      rowId,
      minLat, maxLat,
      minLng, maxLng
    );
  `.compile(db)
  );

  await db.executeQuery(
    sql`
    CREATE TRIGGER IF NOT EXISTS hotspots_rtree_ai
    AFTER INSERT ON hotspots
    BEGIN
      INSERT OR REPLACE INTO hotspots_rtree(rowId, minLat, maxLat, minLng, maxLng)
      VALUES (NEW.rowId, NEW.lat, NEW.lat, NEW.lng, NEW.lng);
    END;
  `.compile(db)
  );

  await db.executeQuery(
    sql`
    CREATE TRIGGER IF NOT EXISTS hotspots_rtree_au
    AFTER UPDATE OF lat, lng ON hotspots
    BEGIN
      UPDATE hotspots_rtree
         SET minLat = NEW.lat, maxLat = NEW.lat,
             minLng = NEW.lng, maxLng = NEW.lng
       WHERE rowId = NEW.rowId;
    END;
  `.compile(db)
  );

  await db.executeQuery(
    sql`
    CREATE TRIGGER IF NOT EXISTS hotspots_rtree_ad
    AFTER DELETE ON hotspots
    BEGIN
      DELETE FROM hotspots_rtree WHERE rowId = OLD.rowId;
    END;
  `.compile(db)
  );

  console.log("Database setup complete");
}

setupDatabase();
