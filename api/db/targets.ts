import Database from "better-sqlite3";
import { CamelCasePlugin, Kysely, sql, SqliteDialect } from "kysely";
import { TARGETS_DB_FILENAME } from "../lib/config.js";
import type { TargetHotspot, MonthTarget, YearTarget, TargetSpecies } from "../lib/types.js";

export type TargetsDatabaseSchema = {
  hotspots: TargetHotspot;
  monthObs: MonthTarget;
  yearObs: YearTarget;
  species: TargetSpecies;
};

const targetsSqlite = new (Database as any)(`${process.env.SQLITE_DIR}${TARGETS_DB_FILENAME}`);
if (!targetsSqlite) {
  throw new Error("Failed to connect to targets SQLite database");
}
targetsSqlite.pragma("foreign_keys = ON");

export const targetsDb = new Kysely<TargetsDatabaseSchema>({
  dialect: new SqliteDialect({
    database: targetsSqlite,
  }),
  plugins: [new CamelCasePlugin()],
});

export async function setupTargetsDatabase() {
  await sql`
  CREATE VIRTUAL TABLE IF NOT EXISTS species_fts USING fts5(
    name,
    sci_name,
    search_codes,
    content='species',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2',
    prefix='2 3 4'
  );
`.execute(targetsDb);

  // Rebuild FTS index to ensure it's in sync with content table, then optimize for query performance
  await sql`INSERT INTO species_fts(species_fts) VALUES('rebuild')`.execute(targetsDb);
  await sql`INSERT INTO species_fts(species_fts) VALUES('optimize')`.execute(targetsDb);

  console.log("Targets database setup complete");
}
