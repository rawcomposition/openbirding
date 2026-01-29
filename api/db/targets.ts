import Database from "better-sqlite3";
import { CamelCasePlugin, Kysely, SqliteDialect } from "kysely";
import { TARGETS_DB_PATH } from "../lib/config.js";
import type { TargetHotspot, MonthTarget, YearTarget, TargetSpecies } from "../lib/types.js";

export type TargetsDatabaseSchema = {
  hotspots: TargetHotspot;
  monthObs: MonthTarget;
  yearObs: YearTarget;
  species: TargetSpecies;
};

const targetsSqlite = new (Database as any)(TARGETS_DB_PATH);
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
