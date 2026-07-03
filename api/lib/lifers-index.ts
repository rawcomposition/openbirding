/**
 * In-memory index for the Lifer Targets / Hot Zones tools.
 *
 * Loads lifers.db (built by scripts/build-lifers-db.ts) into compact typed
 * arrays once at startup, then answers "where can I see the most new species?"
 * queries in tens of milliseconds using pure array arithmetic:
 *
 *     lifers[loc] = qCount[bucket][loc] - seenCount[loc]
 *
 * seenCount is computed per request by walking only the user's seen species
 * through a compressed-sparse-row (CSR) species -> location index.
 */
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LIFERS_DB_FILENAME } from "./config.js";
import { topByLifers, type GeoArrays } from "./geo-query.js";

export type SpeciesInput = {
  sciName?: string | null;
  commonName?: string | null;
  code?: string | null;
};

export type LiferHotspot = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  regionCode: string;
  lifers: number;
  totalSpecies: number; // quality species at this hotspot (at the chosen frequency)
  checklists: number;
};

export type LiferZone = {
  cellRef: number;
  h3: string;
  lat: number;
  lng: number;
  regionCode: string;
  lifers: number;
  totalSpecies: number;
  checklists: number;
};

export type GeoTargetQuery = {
  seenIds: Set<number>;
  bucket: number;
  minChecklists: number;
  regionCodes: string[] | null;
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  limit: number;
};

type SpeciesMeta = { id: number; code: string; name: string; sciName: string; taxonOrder: number };

class LifersIndex {
  readonly buckets: number[];
  readonly minChecklistsFloor: number;
  readonly versionMonth: string;
  readonly versionYear: string;
  readonly generatedAt: string;
  readonly numLocs: number;

  // Per-location metadata (indexed by loc_ref)
  private readonly samples: Int32Array;
  private readonly lat: Float32Array;
  private readonly lng: Float32Array;
  private readonly locId: string[];
  private readonly locName: string[];
  private readonly regionCode: string[];

  // qCount[bucket][loc_ref] = # quality species at that location for the threshold
  private readonly qCount: Int32Array[];

  // CSR species -> locations
  private readonly spOff: Int32Array; // length maxSpeciesId + 2
  private readonly csrLoc: Int32Array;
  private readonly csrLvl: Uint8Array;

  // Species resolution
  private readonly bySci = new Map<string, number>();
  private readonly byName = new Map<string, number>();
  private readonly byCode = new Map<string, number>();
  private readonly speciesById = new Map<number, SpeciesMeta>();

  // Scratch buffer reused across (synchronous) queries.
  private readonly counter: Int32Array;

  private readonly dbPath: string;

  // Zone (H3) dataset — loaded lazily on first zone query.
  private zones: {
    numRefs: number;
    h3: BigInt64Array;
    geo: GeoArrays;
    qCount: Int32Array[];
  } | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    const db = new Database(dbPath, { readonly: true });
    db.pragma("cache_size = -500000");

    const meta = db.prepare("SELECT * FROM metadata").get() as any;
    this.buckets = JSON.parse(meta.buckets);
    this.minChecklistsFloor = meta.min_checklists;
    this.versionMonth = meta.version_month;
    this.versionYear = meta.version_year;
    this.generatedAt = meta.generated_at;

    this.numLocs = (db.prepare("SELECT COUNT(*) c FROM loc_meta").get() as any).c;
    const maxSid = (db.prepare("SELECT MAX(species_id) m FROM loc_species").get() as any).m as number;
    const totalRows = (db.prepare("SELECT COUNT(*) c FROM loc_species").get() as any).c as number;

    const n = this.numLocs;
    this.samples = new Int32Array(n);
    this.lat = new Float32Array(n);
    this.lng = new Float32Array(n);
    this.locId = new Array(n);
    this.locName = new Array(n);
    this.regionCode = new Array(n);
    this.counter = new Int32Array(n);

    for (const [ref, id, name, la, ln, rc, s] of db
      .prepare("SELECT loc_ref, location_id, name, lat, lng, region_code, samples FROM loc_meta")
      .raw()
      .iterate() as Iterable<any[]>) {
      this.samples[ref] = s;
      this.lat[ref] = la;
      this.lng[ref] = ln;
      this.locId[ref] = id;
      this.locName[ref] = name ?? id;
      this.regionCode[ref] = rc ?? "";
    }

    this.qCount = this.buckets.map(() => new Int32Array(n));
    for (const [bucket, ref, q] of db
      .prepare("SELECT bucket, loc_ref, q_count FROM loc_qcount")
      .raw()
      .iterate() as Iterable<any[]>) {
      this.qCount[bucket][ref] = q;
    }

    // Build CSR: count per species, prefix-sum into offsets, then fill.
    this.spOff = new Int32Array(maxSid + 2);
    for (const [sid] of db.prepare("SELECT species_id FROM loc_species").raw().iterate() as Iterable<any[]>) {
      this.spOff[sid + 1]++;
    }
    for (let i = 1; i < this.spOff.length; i++) this.spOff[i] += this.spOff[i - 1];
    this.csrLoc = new Int32Array(totalRows);
    this.csrLvl = new Uint8Array(totalRows);
    const cursor = this.spOff.slice();
    for (const [sid, ref, lvl] of db
      .prepare("SELECT species_id, loc_ref, bucket_level FROM loc_species")
      .raw()
      .iterate() as Iterable<any[]>) {
      const p = cursor[sid]++;
      this.csrLoc[p] = ref;
      this.csrLvl[p] = lvl;
    }

    for (const [id, code, name, sciName, sciLower, nameLower, taxonOrder] of db
      .prepare("SELECT id, code, name, sci_name, sci_lower, name_lower, taxon_order FROM species")
      .raw()
      .iterate() as Iterable<any[]>) {
      this.bySci.set(sciLower, id);
      this.byName.set(nameLower, id);
      this.byCode.set(code.toLowerCase(), id);
      this.speciesById.set(id, { id, code, name, sciName, taxonOrder });
    }

    db.close();
  }

  /** Snap a frequency (0-1) to the nearest available bucket index. */
  bucketForFrequency(frequency: number): number {
    let best = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      if (this.buckets[i] <= frequency + 1e-9) best = i;
    }
    return best;
  }

  /** Resolve a list of species inputs to internal species ids. */
  resolveSpecies(inputs: SpeciesInput[]): { ids: Set<number>; matched: number; unmatched: string[] } {
    const ids = new Set<number>();
    const unmatched: string[] = [];
    for (const input of inputs) {
      const code = input.code?.trim().toLowerCase();
      const sci = input.sciName?.trim().toLowerCase();
      const common = input.commonName?.trim().toLowerCase();
      let id: number | undefined;
      if (code) id = this.byCode.get(code);
      if (id == null && sci) id = this.bySci.get(sci);
      if (id == null && common) id = this.byName.get(common);
      if (id == null && sci) {
        // eBird "slash"/subspecies forms: fall back to the base binomial.
        const base = sci.split("/")[0].split(" ").slice(0, 2).join(" ");
        id = this.bySci.get(base);
      }
      if (id != null) ids.add(id);
      else unmatched.push(input.sciName || input.commonName || input.code || "");
    }
    return { ids, matched: ids.size, unmatched: unmatched.filter(Boolean) };
  }

  private get hotspotGeo(): GeoArrays {
    return {
      numRefs: this.numLocs,
      samples: this.samples,
      lat: this.lat,
      lng: this.lng,
      regionCode: this.regionCode,
      spOff: this.spOff,
      csrRef: this.csrLoc,
      csrLvl: this.csrLvl,
      counter: this.counter,
    };
  }

  queryHotspots(q: GeoTargetQuery): LiferHotspot[] {
    const minChecklists = Math.max(q.minChecklists, this.minChecklistsFloor);
    const q0 = this.qCount[q.bucket];
    const top = topByLifers(this.hotspotGeo, {
      seenIds: q.seenIds,
      bucket: q.bucket,
      qCountForBucket: q0,
      minChecklists,
      regionCodes: q.regionCodes,
      bbox: q.bbox,
      limit: q.limit,
    });
    return top.map(({ ref, lifers }) => ({
      id: this.locId[ref],
      name: this.locName[ref],
      lat: this.lat[ref],
      lng: this.lng[ref],
      regionCode: this.regionCode[ref],
      lifers,
      totalSpecies: q0[ref],
      checklists: this.samples[ref],
    }));
  }

  /** Load the zone (H3) dataset into memory (idempotent). */
  loadZones(): void {
    if (this.zones) return;
    const db = new Database(this.dbPath, { readonly: true });
    db.pragma("cache_size = -500000");

    const numRefs = (db.prepare("SELECT COUNT(*) c FROM zone_meta").get() as any).c as number;
    const maxCellRef = (db.prepare("SELECT MAX(cell_ref) m FROM zone_meta").get() as any).m as number;
    const maxSid = (db.prepare("SELECT MAX(species_id) m FROM zone_species").get() as any).m as number;
    const totalRows = (db.prepare("SELECT COUNT(*) c FROM zone_species").get() as any).c as number;

    // cell_ref is a sparse integer; index arrays by cell_ref directly.
    const size = maxCellRef + 1;
    const samples = new Int32Array(size);
    const lat = new Float32Array(size);
    const lng = new Float32Array(size);
    const h3 = new BigInt64Array(size);
    const regionCode: string[] = new Array(size).fill("");

    // h3 is a full 64-bit integer, so read this statement in safe-integer (BigInt)
    // mode and coerce the small columns back to numbers.
    for (const [ref, hh, la, ln, rc, s] of db
      .prepare("SELECT cell_ref, h3, lat, lng, region_code, samples FROM zone_meta")
      .raw()
      .safeIntegers()
      .iterate() as Iterable<any[]>) {
      const r = Number(ref);
      samples[r] = Number(s);
      lat[r] = Number(la);
      lng[r] = Number(ln);
      h3[r] = typeof hh === "bigint" ? hh : BigInt(hh);
      regionCode[r] = rc ?? "";
    }

    const qCount = this.buckets.map(() => new Int32Array(size));
    for (const [bucket, ref, q] of db
      .prepare("SELECT bucket, cell_ref, q_count FROM zone_qcount")
      .raw()
      .iterate() as Iterable<any[]>) {
      qCount[bucket][ref] = q;
    }

    const spOff = new Int32Array(maxSid + 2);
    for (const [sid] of db.prepare("SELECT species_id FROM zone_species").raw().iterate() as Iterable<any[]>) {
      spOff[sid + 1]++;
    }
    for (let i = 1; i < spOff.length; i++) spOff[i] += spOff[i - 1];
    const csrRef = new Int32Array(totalRows);
    const csrLvl = new Uint8Array(totalRows);
    const cursor = spOff.slice();
    for (const [sid, ref, lvl] of db
      .prepare("SELECT species_id, cell_ref, bucket_level FROM zone_species")
      .raw()
      .iterate() as Iterable<any[]>) {
      const p = cursor[sid]++;
      csrRef[p] = ref;
      csrLvl[p] = lvl;
    }
    db.close();

    this.zones = {
      numRefs: size,
      h3,
      qCount,
      geo: { numRefs: size, samples, lat, lng, regionCode, spOff, csrRef, csrLvl, counter: new Int32Array(size) },
    };
  }

  get zonesLoaded(): boolean {
    return this.zones != null;
  }

  queryZones(q: GeoTargetQuery): LiferZone[] {
    if (!this.zones) throw new Error("Zones not loaded");
    const minChecklists = Math.max(q.minChecklists, this.minChecklistsFloor);
    const q0 = this.zones.qCount[q.bucket];
    const top = topByLifers(this.zones.geo, {
      seenIds: q.seenIds,
      bucket: q.bucket,
      qCountForBucket: q0,
      minChecklists,
      regionCodes: q.regionCodes,
      bbox: q.bbox,
      limit: q.limit,
    });
    return top.map(({ ref, lifers }) => ({
      cellRef: ref,
      h3: BigInt.asUintN(64, this.zones!.h3[ref]).toString(16),
      lat: this.zones!.geo.lat[ref],
      lng: this.zones!.geo.lng[ref],
      regionCode: this.zones!.geo.regionCode[ref],
      lifers,
      totalSpecies: q0[ref],
      checklists: this.zones!.geo.samples[ref],
    }));
  }

  getSpeciesMeta(id: number): SpeciesMeta | undefined {
    return this.speciesById.get(id);
  }
}

// --- singleton, loaded lazily in the background -----------------------------

function lifersDbPath(): string {
  return join(process.env.SQLITE_DIR ?? "/data", LIFERS_DB_FILENAME);
}

let loadPromise: Promise<LifersIndex> | null = null;
let loadError: string | null = null;

function startLoad(): Promise<LifersIndex> {
  const path = lifersDbPath();
  if (!existsSync(path)) {
    loadError = `lifers.db not found at ${path}`;
    return Promise.reject(new Error(loadError));
  }
  // Building the index is CPU-bound and synchronous; defer a tick so import
  // of this module never blocks server startup.
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        const start = Date.now();
        const index = new LifersIndex(path);
        console.log(`Lifers index loaded (${index.numLocs} locations) in ${Date.now() - start} ms`);
        resolve(index);
      } catch (err) {
        loadError = err instanceof Error ? err.message : String(err);
        console.error("Failed to load lifers index:", loadError);
        reject(err);
      }
    });
  });
}

function ensureLoad(): Promise<LifersIndex> {
  if (!loadPromise) {
    loadPromise = startLoad();
    // Guard against an unhandled rejection when nobody is awaiting yet; real
    // awaiters still observe the rejection via getLifersIndex().
    loadPromise.catch(() => {});
  }
  return loadPromise;
}

/** Kick off background loading (idempotent). */
export function warmLifersIndex(): void {
  ensureLoad();
}

/** Await the ready index (starts loading if needed). Throws if unavailable. */
export function getLifersIndex(): Promise<LifersIndex> {
  return ensureLoad();
}

export function lifersIndexStatus(): { available: boolean; error: string | null } {
  return { available: existsSync(lifersDbPath()), error: loadError };
}

export type { LifersIndex };
