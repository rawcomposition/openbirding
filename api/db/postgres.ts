import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { Kysely, PostgresDialect, CamelCasePlugin, Migrator, FileMigrationProvider, type Generated } from "kysely";

export type Hotspot = {
  id: string;
  name: string;
  countryCode: string;
  subnational1: string | null;
  subnational2: string | null;
  lat: number;
  lng: number;
  numSpecies: number | null;
  numChecklists: number | null;
  firstSyncedAt: Generated<Date>;
  lastSyncedAt: Date;
  deletedAt: Date | null;
  updatedAt: Generated<Date>;
};

export type PostgresDatabaseSchema = {
  hotspots: Hotspot;
};

export const pgDb = new Kysely<PostgresDatabaseSchema>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  }),
  plugins: [new CamelCasePlugin()],
});

export async function migratePostgres() {
  const migrator = new Migrator({
    db: pgDb,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations"),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    console.log(`Postgres migration ${result.status}: ${result.migrationName}`);
  }
  if (error) throw error;
}
