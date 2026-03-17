import Database from "better-sqlite3";
import { CamelCasePlugin, Kysely, SqliteDialect } from "kysely";
import { TARGETS_DB_FILENAME } from "../lib/config.js";
import type { TargetHotspot, MonthTarget, YearTarget, TargetSpecies, TargetMetadata } from "../lib/types.js";

export type TargetsDatabaseSchema = {
  hotspots: TargetHotspot;
  monthObs: MonthTarget;
  yearObs: YearTarget;
  species: TargetSpecies;
  metadata: TargetMetadata;
};

let targetsDb: Kysely<TargetsDatabaseSchema> | null = null;

try {
  const targetsSqlite = new (Database as any)(`${process.env.SQLITE_DIR}${TARGETS_DB_FILENAME}`);
  targetsSqlite.pragma("foreign_keys = ON");
  targetsDb = new Kysely<TargetsDatabaseSchema>({
    dialect: new SqliteDialect({
      database: targetsSqlite,
    }),
    plugins: [new CamelCasePlugin()],
  });
} catch (error) {
  console.warn("Targets database not available:", error instanceof Error ? error.message : error);
}

export { targetsDb };

export async function getTargetsMetadata(): Promise<TargetMetadata> {
  if (!targetsDb) throw new Error("Targets database not available");
  const row = await targetsDb.selectFrom("metadata").selectAll().executeTakeFirstOrThrow();
  return row;
}

