import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<any>) {
  await db.schema
    .createTable("hotspot_access")
    .addColumn("hotspot_id", "text", (c) => c.primaryKey().references("hotspots.id").onDelete("cascade"))
    .addColumn("status", "text", (c) => c.notNull())
    .addColumn("fee_required", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("time_restricted", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("permit_required", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("note", "varchar(200)")
    .addColumn("verified_on", "date", (c) => c.notNull().defaultTo(sql`CURRENT_DATE`))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("chk_hotspot_access_status", sql`status IN ('open', 'not_open', 'unknown')`)
    .addCheckConstraint(
      "chk_hotspot_access_flags_only_when_open",
      sql`status = 'open' OR NOT (fee_required OR time_restricted OR permit_required)`
    )
    .addCheckConstraint(
      "chk_hotspot_access_flags_require_note",
      sql`NOT (fee_required OR time_restricted OR permit_required) OR note IS NOT NULL`
    )
    .execute();

  await db.schema.createIndex("hotspot_access_status_idx").on("hotspot_access").column("status").execute();
}

export async function down(db: Kysely<any>) {
  await db.schema.dropTable("hotspot_access").execute();
}
