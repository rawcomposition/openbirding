import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>) {
  await db.schema
    .createTable("hotspots")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("country_code", "text", (c) => c.notNull())
    .addColumn("subnational1", "text")
    .addColumn("subnational2", "text")
    .addColumn("lat", "double precision", (c) => c.notNull())
    .addColumn("lng", "double precision", (c) => c.notNull())
    .addColumn("latest_obs_at", "timestamptz")
    .addColumn("num_species", "integer")
    .addColumn("num_checklists", "integer")
    .addColumn("first_synced_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("last_synced_at", "timestamptz", (c) => c.notNull())
    .addColumn("deleted_at", "timestamptz")
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("hotspots_lat_lng_idx")
    .on("hotspots")
    .columns(["lat", "lng"])
    .execute();
}

export async function down(db: Kysely<any>) {
  await db.schema.dropTable("hotspots").execute();
}
