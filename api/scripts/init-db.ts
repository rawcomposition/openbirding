import { sql } from "kysely";
import db from "../lib/sqlite.js";

export async function setupDatabase() {
  await db.schema
    .createTable("hotspots")
    .ifNotExists()
    .addColumn("row_id", "integer", (c) => c.primaryKey())
    .addColumn("id", "text", (c) => c.notNull().unique())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("region", "text")
    .addColumn("country", "text")
    .addColumn("state", "text")
    .addColumn("county", "text")
    .addColumn("species", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("lat", "real", (c) => c.notNull())
    .addColumn("lng", "real", (c) => c.notNull())
    .addColumn("open", "integer")
    .addColumn("notes", "text")
    .addColumn("last_updated_by", "text")
    .addColumn("created_at", "text", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "text") // Updated by trigger
    .addCheckConstraint("chk_lat", sql`lat BETWEEN -90 AND 90`)
    .addCheckConstraint("chk_lng", sql`lng BETWEEN -180 AND 180`)
    .addCheckConstraint("chk_open_bool", sql`open IN (0,1) OR open IS NULL`)
    .addForeignKeyConstraint("fk_hotspots_region", ["region"], "regions", ["id"], (cb) => cb.onDelete("set null"))
    .addForeignKeyConstraint("fk_hotspots_country", ["country"], "regions", ["id"], (cb) => cb.onDelete("set null"))
    .addForeignKeyConstraint("fk_hotspots_state", ["state"], "regions", ["id"], (cb) => cb.onDelete("set null"))
    .addForeignKeyConstraint("fk_hotspots_county", ["county"], "regions", ["id"], (cb) => cb.onDelete("set null"))
    .addForeignKeyConstraint("fk_hotspots_last_updated_by", ["last_updated_by"], "user", ["id"], (cb) =>
      cb.onDelete("set null")
    )
    .execute();

  await db.schema
    .createTable("hotspot_revisions")
    .ifNotExists()
    .addColumn("id", "integer", (c) => c.primaryKey())
    .addColumn("hotspot_id", "text", (c) => c.notNull())
    .addColumn("user_id", "text")
    .addColumn("notes", "text")
    .addColumn("open", "integer")
    .addColumn("created_at", "text", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addForeignKeyConstraint("fk_hotspot_revisions_hotspot", ["hotspot_id"], "hotspots", ["id"], (cb) =>
      cb.onDelete("cascade")
    )
    .addForeignKeyConstraint("fk_hotspot_revisions_user", ["user_id"], "user", ["id"], (cb) => cb.onDelete("set null"))
    .addCheckConstraint("chk_revision_open_bool", sql`open IN (0,1) OR open IS NULL`)
    .execute();

  await db.executeQuery(
    sql`
    CREATE TRIGGER IF NOT EXISTS hotspots_revision_trigger
    AFTER UPDATE OF notes, open ON hotspots
    WHEN (OLD.notes IS NOT NEW.notes OR OLD.open IS NOT NEW.open)
    BEGIN
      UPDATE hotspots SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      INSERT INTO hotspot_revisions (hotspot_id, user_id, notes, open)
      VALUES (NEW.id, NEW.last_updated_by, NEW.notes, NEW.open);
    END;
  `.compile(db)
  );

  await db.schema
    .createTable("packs")
    .ifNotExists()
    .addColumn("id", "integer", (c) => c.primaryKey())
    .addColumn("region", "text", (c) => c.notNull().unique())
    .addColumn("hotspots", "integer")
    .addColumn("last_synced", "text")
    .addForeignKeyConstraint("fk_packs_region", ["region"], "regions", ["id"], (cb) => cb.onDelete("cascade"))
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
    .createTable("user")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("email", "text", (c) => c.notNull().unique())
    .addColumn("password", "text", (c) => c.notNull())
    .addColumn("email_verified", "integer", (c) =>
      c
        .notNull()
        .defaultTo(0)
        .check(sql`email_verified IN (0, 1)`)
    )
    .addColumn("is_admin", "integer", (c) =>
      c
        .notNull()
        .defaultTo(0)
        .check(sql`is_admin IN (0, 1)`)
    )
    .addColumn("created_at", "text", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updated_at", "text", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable("session")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("user_id", "text", (c) => c.notNull())
    .addColumn("secret_hash", "blob", (c) => c.notNull())
    .addColumn("created_at", "text", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addForeignKeyConstraint("fk_session_user", ["user_id"], "user", ["id"], (cb) => cb.onDelete("cascade"))
    .execute();

  await db.schema
    .createTable("login_attempt")
    .ifNotExists()
    .addColumn("id", "integer", (c) => c.primaryKey())
    .addColumn("email", "text", (c) => c.notNull())
    .addColumn("ip_address", "text", (c) => c.notNull())
    .addColumn("attempted_at", "text", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("success", "integer", (c) => c.notNull().check(sql`success IN (0, 1)`))
    .execute();

  await db.schema
    .createTable("email_verification_token")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("user_id", "text", (c) => c.notNull())
    .addColumn("expires_at", "text", (c) => c.notNull())
    .addForeignKeyConstraint("fk_email_verification_user", ["user_id"], "user", ["id"], (cb) => cb.onDelete("cascade"))
    .execute();

  await db.schema
    .createTable("password_reset_token")
    .ifNotExists()
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("user_id", "text", (c) => c.notNull())
    .addColumn("expires_at", "text", (c) => c.notNull())
    .addForeignKeyConstraint("fk_password_reset_user", ["user_id"], "user", ["id"], (cb) => cb.onDelete("cascade"))
    .execute();

  await db.schema
    .createIndex("hotspots_region_species_idx")
    .ifNotExists()
    .on("hotspots")
    .columns(["region", "species"])
    .execute();

  await db.schema.createIndex("hotspots_country_idx").ifNotExists().on("hotspots").columns(["country"]).execute();

  await db.schema.createIndex("hotspots_state_idx").ifNotExists().on("hotspots").columns(["state"]).execute();

  await db.schema.createIndex("hotspots_county_idx").ifNotExists().on("hotspots").columns(["county"]).execute();

  await db.schema
    .createIndex("idx_hotspot_revisions_hotspot_id")
    .ifNotExists()
    .on("hotspot_revisions")
    .columns(["hotspot_id"])
    .execute();

  await db.schema
    .createIndex("idx_hotspot_revisions_user_id")
    .ifNotExists()
    .on("hotspot_revisions")
    .columns(["user_id"])
    .execute();

  await db.schema.createIndex("idx_session_user_id").ifNotExists().on("session").columns(["user_id"]).execute();

  await db.schema
    .createIndex("idx_login_attempt_email_ip")
    .ifNotExists()
    .on("login_attempt")
    .columns(["email", "ip_address"])
    .execute();

  await db.schema
    .createIndex("idx_login_attempt_attempted_at")
    .ifNotExists()
    .on("login_attempt")
    .columns(["attempted_at"])
    .execute();

  await db.schema
    .createIndex("idx_email_verification_token_user_id")
    .ifNotExists()
    .on("email_verification_token")
    .columns(["user_id"])
    .execute();

  await db.schema
    .createIndex("idx_password_reset_token_user_id")
    .ifNotExists()
    .on("password_reset_token")
    .columns(["user_id"])
    .execute();

  await db.executeQuery(
    sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS hotspots_rtree
    USING rtree(
      row_id,
      min_lat, max_lat,
      min_lng, max_lng
    );
  `.compile(db)
  );

  await db.executeQuery(
    sql`
    CREATE TRIGGER IF NOT EXISTS hotspots_rtree_ai
    AFTER INSERT ON hotspots
    BEGIN
      INSERT OR REPLACE INTO hotspots_rtree(row_id, min_lat, max_lat, min_lng, max_lng)
      VALUES (NEW.row_id, NEW.lat, NEW.lat, NEW.lng, NEW.lng);
    END;
  `.compile(db)
  );

  await db.executeQuery(
    sql`
    CREATE TRIGGER IF NOT EXISTS hotspots_rtree_au
    AFTER UPDATE OF lat, lng ON hotspots
    BEGIN
      UPDATE hotspots_rtree
         SET min_lat = NEW.lat, max_lat = NEW.lat,
             min_lng = NEW.lng, max_lng = NEW.lng
       WHERE row_id = NEW.row_id;
    END;
  `.compile(db)
  );

  await db.executeQuery(
    sql`
    CREATE TRIGGER IF NOT EXISTS hotspots_rtree_ad
    AFTER DELETE ON hotspots
    BEGIN
      DELETE FROM hotspots_rtree WHERE row_id = OLD.row_id;
    END;
  `.compile(db)
  );

  console.log("Database setup complete");
}

setupDatabase();
