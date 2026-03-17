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

const unavailableTargetsDb = new Proxy({} as Kysely<TargetsDatabaseSchema>, {
  get() {
    throw new Error("Targets database not available");
  },
});

let hasTargetsDb = false;
let targetsDb: Kysely<TargetsDatabaseSchema> = unavailableTargetsDb;

try {
  const targetsSqlite = new (Database as any)(`${process.env.SQLITE_DIR}${TARGETS_DB_FILENAME}`, {
    readonly: true,
    fileMustExist: true,
  });
  targetsSqlite.pragma("foreign_keys = ON");
  targetsDb = new Kysely<TargetsDatabaseSchema>({
    dialect: new SqliteDialect({
      database: targetsSqlite,
    }),
    plugins: [new CamelCasePlugin()],
  });
  hasTargetsDb = true;
} catch (error) {
  console.warn("Targets database not available:", error instanceof Error ? error.message : error);
}

export { targetsDb, hasTargetsDb };

export async function getTargetsMetadata(): Promise<TargetMetadata> {
  const row = await targetsDb.selectFrom("metadata").selectAll().executeTakeFirstOrThrow();
  return row;
}
