import type { Kysely } from "kysely";

export async function up(db: Kysely<any>) {
  await db.schema.alterTable("hotspots").dropColumn("latest_obs_at").execute();
}

export async function down(db: Kysely<any>) {
  await db.schema.alterTable("hotspots").addColumn("latest_obs_at", "timestamptz").execute();
}
