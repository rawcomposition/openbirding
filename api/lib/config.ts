export const NUM_BACKUPS_TO_KEEP = 7;
export const TARGETS_DB_FILENAME = "targets.db";

/**
 * Compact companion DB of species-occurrence frequencies per hotspot and per
 * H3 cell (built from targets.db by api/scripts/build-occurrences-db.ts).
 * Currently powers Lifer Targets, but the data is tool-agnostic.
 */
export const OCCURRENCES_DB_FILENAME = "occurrences.db";

/**
 * Finest H3 resolution occurrences.db carries/loads. targets.db has res 3-6,
 * but res 5/6 hexes are too fine to be useful in the current UI and account
 * for ~85% of the zone rows (and several hundred MB of RSS), so they are
 * excluded. Raise via env if ever needed.
 */
export const OCCURRENCES_MAX_ZONE_RES = Number(process.env.OCCURRENCES_MAX_ZONE_RES ?? 4);
