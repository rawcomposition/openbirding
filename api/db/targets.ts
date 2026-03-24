import Database from "better-sqlite3";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { CamelCasePlugin, Kysely, SqliteDialect } from "kysely";
import { TARGETS_DB_FILENAME } from "../lib/config.js";
import type { TargetHotspot, MonthTarget, YearTarget, TargetSpecies, TargetMetadata, TargetRegion, RegionMonthObs, RegionMonthSamples } from "../lib/types.js";

export type TargetsDatabaseSchema = {
  hotspots: TargetHotspot;
  monthObs: MonthTarget;
  yearObs: YearTarget;
  species: TargetSpecies;
  metadata: TargetMetadata;
  regions: TargetRegion;
  regionMonthObs: RegionMonthObs;
  regionMonthSamples: RegionMonthSamples;
};

export type TargetsDb = Kysely<TargetsDatabaseSchema>;

const REQUIRED_TABLES = [
  "hotspots", "month_obs", "year_obs", "species",
  "metadata", "regions", "region_month_obs", "region_month_samples",
];

type TargetsDbState = {
  db: TargetsDb;
  activeRequests: number;
  retired: boolean;
  closed: boolean;
};

function openTargetsKysely(path: string): TargetsDb {
  const sqlite = new (Database as any)(path, {
    readonly: true,
    fileMustExist: true,
  });
  sqlite.pragma("foreign_keys = ON");
  return new Kysely<TargetsDatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
    plugins: [new CamelCasePlugin()],
  });
}

function createTargetsDbState(path: string): TargetsDbState {
  return {
    db: openTargetsKysely(path),
    activeRequests: 0,
    retired: false,
    closed: false,
  };
}

function getTargetsDbPath(filename: string): string {
  return join(process.env.SQLITE_DIR ?? "/data", filename);
}

let currentTargetsDb: TargetsDbState | null = null;
let swapInProgress = false;

try {
  currentTargetsDb = createTargetsDbState(getTargetsDbPath(TARGETS_DB_FILENAME));
} catch (error) {
  console.warn("Targets database not available:", error instanceof Error ? error.message : error);
}

export function isTargetsDbAvailable(): boolean {
  return currentTargetsDb != null;
}

export async function withTargetsDb<T>(fn: (db: TargetsDb) => Promise<T>): Promise<T> {
  const state = currentTargetsDb;
  if (!state) {
    throw new Error("Targets database not available");
  }

  state.activeRequests += 1;
  try {
    return await fn(state.db);
  } finally {
    state.activeRequests -= 1;
    if (state.retired && state.activeRequests === 0) {
      void closeTargetsDb(state);
    }
  }
}

export async function getTargetsMetadata(targetsDb: TargetsDb): Promise<TargetMetadata> {
  const row = await targetsDb.selectFrom("metadata").selectAll().executeTakeFirstOrThrow();
  return row;
}

function validateDb(path: string): { ok: true } | { ok: false; error: string } {
  const db = new (Database as any)(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma("integrity_check") as { integrity_check: string }[];
    if (integrity[0]?.integrity_check !== "ok") {
      return { ok: false, error: `integrity_check failed: ${JSON.stringify(integrity)}` };
    }

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name);

    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      return { ok: false, error: `Missing tables: ${missing.join(", ")}` };
    }

    if (!tables.includes("species_fts")) {
      return { ok: false, error: "Missing FTS5 index: species_fts" };
    }

    const meta = db.prepare("SELECT * FROM metadata").get() as Record<string, unknown> | undefined;
    if (!meta?.version || !meta?.version_year || !meta?.generated_at) {
      return { ok: false, error: `Metadata row missing or incomplete: ${JSON.stringify(meta)}` };
    }

    const speciesCount = (db.prepare("SELECT count(*) as c FROM species").get() as { c: number }).c;
    if (speciesCount < 100) {
      return { ok: false, error: `Species count suspiciously low: ${speciesCount}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    db.close();
  }
}

async function closeTargetsDb(state: TargetsDbState): Promise<void> {
  if (state.closed) {
    return;
  }

  state.closed = true;
  try {
    await state.db.destroy();
  } catch (error) {
    console.warn("Failed to close retired targets database:", error instanceof Error ? error.message : error);
  }
}

function retireTargetsDb(state: TargetsDbState): void {
  state.retired = true;
  if (state.activeRequests === 0) {
    void closeTargetsDb(state);
  }
}

export async function swapTargetsDb(): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  if (swapInProgress) {
    return { ok: false, error: "Targets database swap already in progress" };
  }

  swapInProgress = true;
  const newPath = getTargetsDbPath(`${TARGETS_DB_FILENAME}.new`);
  const livePath = getTargetsDbPath(TARGETS_DB_FILENAME);

  try {
    const validation = validateDb(newPath);
    if (!validation.ok) {
      return validation;
    }

    const nextTargetsDb = createTargetsDbState(newPath);

    try {
      await rename(newPath, livePath);
    } catch (error) {
      await closeTargetsDb(nextTargetsDb);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    const previousTargetsDb = currentTargetsDb;
    currentTargetsDb = nextTargetsDb;

    if (previousTargetsDb) {
      retireTargetsDb(previousTargetsDb);
    }

    const meta = await getTargetsMetadata(nextTargetsDb.db);

    console.log(`Targets database swapped to version ${meta.version}`);
    return { ok: true, version: meta.version };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    swapInProgress = false;
  }
}
