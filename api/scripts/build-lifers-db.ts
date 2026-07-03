/**
 * Build lifers.db — a compact companion database that powers the "Lifer Targets"
 * and "Hot Zones" tools.
 *
 * Source: targets.db (read-only, ~12 GB).
 * Output: lifers.db (self-contained; opened read-only by the API).
 *
 * Strategy
 * --------
 * A user's "lifer count" at a location is:
 *     lifers[loc] = qCount[loc]  -  seenCount[loc]
 * where
 *     qCount[loc]    = # species whose adjusted frequency (score) >= threshold at loc
 *     seenCount[loc] = # of THOSE species the user has already seen
 *
 * qCount is user-independent, so we precompute it per location for a fixed set of
 * frequency thresholds ("buckets"). seenCount only touches the user's ~few-hundred
 * seen species, so it is cheap to compute per request by scanning loc_species for
 * just those species. This turns a full 36M-row group-by into two small indexed
 * scans, making worldwide queries fast and exact.
 *
 * Run: npx tsx scripts/build-lifers-db.ts
 */
import Database from "better-sqlite3";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, "../.."); // api/scripts -> web

const SRC = process.env.TARGETS_DB ?? join(WEB_DIR, "targets.db");
const OUT = process.env.LIFERS_DB ?? join(WEB_DIR, "lifers.db");

// Rows below these floors are noise and are dropped from the companion DB.
const MIN_SCORE = 0.01; // 1% adjusted frequency
const MIN_CHECKLISTS = 10; // per-location total checklists

// Frequency thresholds a user can pick from (adjusted frequency, 0-1).
// qCount is precomputed per location for each of these.
export const FREQUENCY_BUCKETS = [0.01, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5];

function log(msg: string) {
  console.log(`[build-lifers] ${new Date().toISOString()} ${msg}`);
}

if (!existsSync(SRC)) {
  console.error(`Source DB not found: ${SRC}`);
  process.exit(1);
}
for (const f of [OUT, `${OUT}-wal`, `${OUT}-shm`]) {
  if (existsSync(f)) unlinkSync(f);
}

log(`Source: ${SRC}`);
log(`Output: ${OUT}`);

// Open lifers.db as the writable main database; attach targets.db read-only
// (immutable=1 => SQLite treats the file as never-changing and never locks/writes it).
const db = new Database(OUT);
db.pragma("journal_mode = OFF");
db.pragma("synchronous = OFF");
db.pragma("cache_size = -1000000"); // ~1 GB page cache for the build
db.pragma("temp_store = MEMORY");
db.pragma("busy_timeout = 60000");
// The build only ever SELECTs from the attached source, so targets.db is never written.
db.exec(`ATTACH DATABASE '${SRC}' AS t`);

// --- Schema ------------------------------------------------------------------
db.exec(`
  CREATE TABLE metadata (
    version TEXT, version_year TEXT, version_month TEXT,
    generated_at TEXT, buckets TEXT,
    min_score REAL, min_checklists INTEGER
  );

  CREATE TABLE species (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    sci_name TEXT NOT NULL,
    sci_lower TEXT NOT NULL,
    name_lower TEXT NOT NULL,
    taxon_order INTEGER NOT NULL
  );

  CREATE TABLE loc_meta (
    loc_ref INTEGER PRIMARY KEY,
    location_id TEXT NOT NULL,
    name TEXT,
    lat REAL, lng REAL,
    country_code TEXT,
    subnational1_code TEXT,
    subnational2_code TEXT,
    region_code TEXT,
    samples INTEGER NOT NULL
  );

  CREATE TABLE loc_species (
    species_id INTEGER NOT NULL,
    loc_ref INTEGER NOT NULL,
    bucket_level INTEGER NOT NULL,
    PRIMARY KEY (species_id, loc_ref)
  ) WITHOUT ROWID;

  CREATE TABLE loc_qcount (
    bucket INTEGER NOT NULL,
    loc_ref INTEGER NOT NULL,
    q_count INTEGER NOT NULL,
    PRIMARY KEY (bucket, loc_ref)
  ) WITHOUT ROWID;

  -- Zone (H3 hexagon) tables mirror the location tables but aggregate eBird's
  -- month-partitioned H3 data to a single year-level frequency per cell.
  CREATE TABLE zone_meta (
    cell_ref INTEGER PRIMARY KEY,
    h3 INTEGER,
    lat REAL, lng REAL,
    region_code TEXT,
    samples INTEGER NOT NULL
  );

  CREATE TABLE zone_species (
    species_id INTEGER NOT NULL,
    cell_ref INTEGER NOT NULL,
    bucket_level INTEGER NOT NULL,
    PRIMARY KEY (species_id, cell_ref)
  ) WITHOUT ROWID;

  CREATE TABLE zone_qcount (
    bucket INTEGER NOT NULL,
    cell_ref INTEGER NOT NULL,
    q_count INTEGER NOT NULL,
    PRIMARY KEY (bucket, cell_ref)
  ) WITHOUT ROWID;
`);

// --- metadata ---------------------------------------------------------------
{
  const meta = db.prepare("SELECT * FROM t.metadata").get() as any;
  db.prepare(
    `INSERT INTO metadata
     (version, version_year, version_month, generated_at, buckets, min_score, min_checklists)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    meta.version,
    meta.version_year,
    meta.version_month,
    new Date().toISOString(),
    JSON.stringify(FREQUENCY_BUCKETS),
    MIN_SCORE,
    MIN_CHECKLISTS
  );
}

// --- species ----------------------------------------------------------------
log("Copying species...");
db.exec(`
  INSERT INTO species (id, code, name, sci_name, sci_lower, name_lower, taxon_order)
  SELECT id, code, name, sci_name, lower(sci_name), lower(name), taxon_order
  FROM t.species;
`);
db.exec(`CREATE INDEX idx_species_sci ON species(sci_lower);`);
db.exec(`CREATE INDEX idx_species_name ON species(name_lower);`);
db.exec(`CREATE INDEX idx_species_code ON species(code);`);
log(`  species: ${(db.prepare("SELECT COUNT(*) c FROM species").get() as any).c}`);

// bucket_level(score) = (# thresholds <= score) - 1, i.e. the highest bucket index met.
const bucketLevelExpr = `(${FREQUENCY_BUCKETS.map((t) => `(score >= ${t})`).join(" + ")} - 1)`;

// --- loc_meta ---------------------------------------------------------------
// samples is constant per location in year_obs; take MAX as the location total.
// loc_ref is a dense integer id (assigned by descending sample count for locality).
log("Building loc_meta...");
db.exec(`
  INSERT INTO loc_meta
    (loc_ref, location_id, name, lat, lng, country_code, subnational1_code, subnational2_code, region_code, samples)
  SELECT
    ROW_NUMBER() OVER (ORDER BY ls.total_samples DESC, ls.location_id) - 1,
    h.id, h.name, h.lat, h.lng, h.country_code, h.subnational1_code, h.subnational2_code, h.region_code, ls.total_samples
  FROM (
    SELECT location_id, MAX(samples) AS total_samples
    FROM t.year_obs
    GROUP BY location_id
    HAVING total_samples >= ${MIN_CHECKLISTS}
  ) ls
  JOIN t.hotspots h ON h.id = ls.location_id;
`);
db.exec(`CREATE UNIQUE INDEX idx_loc_meta_locid ON loc_meta(location_id);`);
db.exec(`CREATE INDEX idx_loc_meta_region ON loc_meta(region_code);`);
db.exec(`CREATE INDEX idx_loc_meta_samples ON loc_meta(samples);`);
log(`  loc_meta: ${(db.prepare("SELECT COUNT(*) c FROM loc_meta").get() as any).c}`);

// --- loc_species ------------------------------------------------------------
// Only rows at kept locations, above the noise floor. Store integer loc_ref and
// the quantized bucket level (so the in-memory index needs no float math).
log("Building loc_species (this is the big one)...");
db.exec(`
  INSERT INTO loc_species (species_id, loc_ref, bucket_level)
  SELECT yo.species_id, m.loc_ref, ${bucketLevelExpr.replace(/score/g, "yo.score")}
  FROM t.year_obs yo
  JOIN loc_meta m ON m.location_id = yo.location_id
  WHERE yo.score >= ${MIN_SCORE};
`);
log(`  loc_species: ${(db.prepare("SELECT COUNT(*) c FROM loc_species").get() as any).c}`);

// --- loc_qcount -------------------------------------------------------------
log("Building loc_qcount (per-location species counts per threshold)...");
const insertQ = db.prepare(
  `INSERT INTO loc_qcount (bucket, loc_ref, q_count)
   SELECT ?, loc_ref, COUNT(*)
   FROM loc_species
   WHERE bucket_level >= ?
   GROUP BY loc_ref`
);
FREQUENCY_BUCKETS.forEach((threshold, bucket) => {
  const info = insertQ.run(bucket, bucket);
  log(`  bucket ${bucket} (>=${threshold}): ${info.changes} locations`);
});

// --- zone_meta --------------------------------------------------------------
// Year-level total checklists per H3 cell (sum across months).
log("Building zone_meta...");
db.exec(`
  INSERT INTO zone_meta (cell_ref, h3, lat, lng, region_code, samples)
  SELECT c.cell_ref, c.h3, c.lat, c.lng, c.region_code, cs.total_samples
  FROM (
    SELECT cell_ref, SUM(samples) AS total_samples
    FROM t.h3_cell_samples
    GROUP BY cell_ref
    HAVING total_samples >= ${MIN_CHECKLISTS}
  ) cs
  JOIN t.h3_cells c ON c.cell_ref = cs.cell_ref;
`);
db.exec(`CREATE INDEX idx_zone_meta_region ON zone_meta(region_code);`);
db.exec(`CREATE INDEX idx_zone_meta_samples ON zone_meta(samples);`);
log(`  zone_meta: ${(db.prepare("SELECT COUNT(*) c FROM zone_meta").get() as any).c}`);

// --- zone_species -----------------------------------------------------------
// Aggregate month-partitioned obs to a year-level frequency per (cell, species).
log("Building zone_species (aggregating H3 months — the slow one)...");
db.exec(`
  INSERT INTO zone_species (species_id, cell_ref, bucket_level)
  SELECT o.species_id, o.cell_ref, ${bucketLevelExpr.replace(/score/g, "(SUM(o.obs) * 1.0 / z.samples)")}
  FROM t.h3_cell_obs o
  JOIN zone_meta z ON z.cell_ref = o.cell_ref
  GROUP BY o.cell_ref, o.species_id
  HAVING (SUM(o.obs) * 1.0 / z.samples) >= ${MIN_SCORE};
`);
log(`  zone_species: ${(db.prepare("SELECT COUNT(*) c FROM zone_species").get() as any).c}`);

// --- zone_qcount ------------------------------------------------------------
log("Building zone_qcount...");
const insertZoneQ = db.prepare(
  `INSERT INTO zone_qcount (bucket, cell_ref, q_count)
   SELECT ?, cell_ref, COUNT(*)
   FROM zone_species
   WHERE bucket_level >= ?
   GROUP BY cell_ref`
);
FREQUENCY_BUCKETS.forEach((threshold, bucket) => {
  const info = insertZoneQ.run(bucket, bucket);
  log(`  bucket ${bucket} (>=${threshold}): ${info.changes} zones`);
});

log("Finalizing (analyze)...");
db.exec("ANALYZE;");
db.close();
log("Done. lifers.db built.");
