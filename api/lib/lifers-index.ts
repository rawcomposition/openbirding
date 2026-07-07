/**
 * In-memory index for the Lifer Targets / Hot Zones tools.
 *
 * Loads occurrences.db (built by the aggregator repo's generate_occurrences.py) into compact typed
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
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { OCCURRENCES_DB_FILENAME, OCCURRENCES_MAX_ZONE_RES } from "./config.js";
import { topByLifers, allInBbox, type GeoArrays } from "./geo-query.js";

export type GridCell = { h3: string; lifers: number };
export type CellInfo = {
  h3: string;
  samples: number;
  totalSpecies: number;
  lifers: number;
  /** Named eBird hotspots whose location falls inside this cell. */
  namedHotspots: number;
  /** Total checklists across those named hotspots. */
  hotspotChecklists: number;
};
export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };
type ZoneDataset = {
  res: number;
  numRefs: number;
  h3: BigInt64Array;
  geo: GeoArrays;
  qCount: Int32Array[];
  byH3: Map<string, number>; // h3 hex string -> cell_ref, for reverse lookups
};

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

export type GeoTargetQuery = {
  seenIds: Set<number>;
  bucket: number;
  minChecklists: number;
  regionCodes: string[] | null;
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
  limit: number;
};

type SpeciesMeta = { id: number; code: string; name: string; sciName: string; taxonOrder: number };

/**
 * Reader over the optional `blob_cache` table (written by
 * aggregator/generate_occurrences.py): the big row tables pre-packed as typed-array
 * blobs so the index loads with a few memcpy-speed reads (~1s) instead of
 * iterating ~66M rows through the JS statement cursor (~60s, blocking the
 * event loop). Returns null when the DB hasn't been packed — callers fall
 * back to row iteration.
 */
function blobReader(db: Database.Database): ((key: string) => Buffer) | null {
  const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'blob_cache'").get();
  if (!has) return null;
  const stmt = db.prepare("SELECT data FROM blob_cache WHERE key = ?");
  return (key: string) => {
    const row = stmt.get(key) as { data: Buffer } | undefined;
    if (!row) throw new Error(`blob_cache missing key ${key}`);
    return row.data;
  };
}

type TypedArrayCtor<T> = new (buffer: ArrayBuffer) => T;

/** Copy a SQLite blob into an aligned buffer and view it as a typed array. */
function blobToArray<T>(buf: Buffer, Ctor: TypedArrayCtor<T>): T {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return new Ctor(ab);
}

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

  /** Mutable: swapOccurrencesDb() re-points it at the live path after rename. */
  dbPath: string;

  // Zone (H3) datasets, one per resolution (res 3..6) — loaded lazily together
  // on first zone/grid query. Coarse resolutions colour the map when zoomed out,
  // finer ones as you zoom in.
  private zonesByRes: Map<number, ZoneDataset> | null = null;

  // Precomputed per-resolution "which zone cell is this hotspot in" (-1 = none),
  // baked into occurrences.db by the aggregator so cellsInfo() never needs H3
  // coordinate math (or the h3-js dependency) at request time.
  private readonly locCellRef = new Map<number, Int32Array>();

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

    const n = this.numLocs;
    this.locId = new Array(n);
    this.locName = new Array(n);
    this.regionCode = new Array(n);
    this.counter = new Int32Array(n);

    const getBlob = blobReader(db);
    if (getBlob) {
      // Fast path: numeric arrays come straight from packed blobs; only the
      // string columns still walk loc_meta rows.
      this.samples = blobToArray(getBlob("loc:samples"), Int32Array);
      this.lat = blobToArray(getBlob("loc:lat"), Float32Array);
      this.lng = blobToArray(getBlob("loc:lng"), Float32Array);
      const qAll = blobToArray(getBlob("loc:qcount"), Int32Array);
      this.qCount = this.buckets.map((_, b) => qAll.subarray(b * n, (b + 1) * n));
      this.spOff = blobToArray(getBlob("loc:spOff"), Int32Array);
      this.csrLoc = blobToArray(getBlob("loc:csrRef"), Int32Array);
      this.csrLvl = blobToArray(getBlob("loc:csrLvl"), Uint8Array);

      for (const [ref, id, name, rc] of db
        .prepare("SELECT loc_ref, location_id, name, region_code FROM loc_meta")
        .raw()
        .iterate() as Iterable<any[]>) {
        this.locId[ref] = id;
        this.locName[ref] = name ?? id;
        this.regionCode[ref] = rc ?? "";
      }
    } else {
      // Fallback for an unpacked occurrences.db: iterate the row tables (slow).
      const maxSid = (db.prepare("SELECT MAX(species_id) m FROM loc_species").get() as any).m as number;
      const totalRows = (db.prepare("SELECT COUNT(*) c FROM loc_species").get() as any).c as number;

      this.samples = new Int32Array(n);
      this.lat = new Float32Array(n);
      this.lng = new Float32Array(n);

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

  queryHotspots(q: GeoTargetQuery): { items: LiferHotspot[]; candidates: number } {
    const minChecklists = Math.max(q.minChecklists, this.minChecklistsFloor);
    const q0 = this.qCount[q.bucket];
    const { top, candidates } = topByLifers(this.hotspotGeo, {
      seenIds: q.seenIds,
      bucket: q.bucket,
      qCountForBucket: q0,
      minChecklists,
      regionCodes: q.regionCodes,
      bbox: q.bbox,
      limit: q.limit,
    });
    const items = top.map(({ ref, lifers }) => ({
      id: this.locId[ref],
      name: this.locName[ref],
      lat: this.lat[ref],
      lng: this.lng[ref],
      regionCode: this.regionCode[ref],
      lifers,
      totalSpecies: q0[ref],
      checklists: this.samples[ref],
    }));
    return { items, candidates };
  }

  /** Load every H3 resolution into memory (idempotent). */
  loadZones(): void {
    if (this.zonesByRes) return;
    const db = new Database(this.dbPath, { readonly: true });
    db.pragma("cache_size = -500000");

    const resList = (db.prepare("SELECT DISTINCT res FROM zone_meta ORDER BY res").all() as any[])
      .map((r) => r.res as number)
      .filter((res) => res <= OCCURRENCES_MAX_ZONE_RES);
    const byRes = new Map<number, ZoneDataset>();
    const getBlob = blobReader(db);

    for (const res of resList) {
      if (getBlob) {
        // Fast path: everything comes from packed blobs — no row iteration.
        const samples = blobToArray(getBlob(`zone:${res}:samples`), Int32Array);
        const size = samples.length;
        const lat = blobToArray(getBlob(`zone:${res}:lat`), Float32Array);
        const lng = blobToArray(getBlob(`zone:${res}:lng`), Float32Array);
        const h3 = blobToArray(getBlob(`zone:${res}:h3`), BigInt64Array);
        const qAll = blobToArray(getBlob(`zone:${res}:qcount`), Int32Array);
        const qCount = this.buckets.map((_, b) => qAll.subarray(b * size, (b + 1) * size));
        const spOff = blobToArray(getBlob(`zone:${res}:spOff`), Int32Array);
        const csrRef = blobToArray(getBlob(`zone:${res}:csrRef`), Int32Array);
        const csrLvl = blobToArray(getBlob(`zone:${res}:csrLvl`), Uint8Array);

        const byH3 = new Map<string, number>();
        for (let ref = 0; ref < size; ref++) {
          if (h3[ref] !== 0n) byH3.set(BigInt.asUintN(64, h3[ref]).toString(16), ref);
        }

        try {
          this.locCellRef.set(res, blobToArray(getBlob(`loc:cellRef:${res}`), Int32Array));
        } catch {
          // Older occurrences.db without the precomputed mapping — cellsInfo()
          // reports zero named hotspots per cell instead of throwing.
        }

        byRes.set(res, {
          res,
          numRefs: size,
          h3,
          qCount,
          byH3,
          geo: { numRefs: size, samples, lat, lng, spOff, csrRef, csrLvl, counter: new Int32Array(size) },
        });
        continue;
      }

      const maxCellRef = (db.prepare("SELECT MAX(cell_ref) m FROM zone_meta WHERE res = ?").get(res) as any)
        .m as number;
      const maxSid = (db.prepare("SELECT MAX(species_id) m FROM zone_species WHERE res = ?").get(res) as any)
        .m as number;
      const totalRows = (db.prepare("SELECT COUNT(*) c FROM zone_species WHERE res = ?").get(res) as any)
        .c as number;

      // cell_ref is a dense integer per resolution; index arrays by it directly.
      const size = maxCellRef + 1;
      const samples = new Int32Array(size);
      const lat = new Float32Array(size);
      const lng = new Float32Array(size);
      const h3 = new BigInt64Array(size);
      const byH3 = new Map<string, number>();

      // h3 is a full 64-bit integer, so read in safe-integer (BigInt) mode and
      // coerce the small columns back to numbers.
      for (const [ref, hh, la, ln, s] of db
        .prepare("SELECT cell_ref, h3, lat, lng, samples FROM zone_meta WHERE res = ?")
        .raw()
        .safeIntegers()
        .iterate(res) as Iterable<any[]>) {
        const r = Number(ref);
        samples[r] = Number(s);
        lat[r] = Number(la);
        lng[r] = Number(ln);
        const hb = typeof hh === "bigint" ? hh : BigInt(hh);
        h3[r] = hb;
        byH3.set(BigInt.asUintN(64, hb).toString(16), r);
      }

      const qCount = this.buckets.map(() => new Int32Array(size));
      for (const [bucket, ref, q] of db
        .prepare("SELECT bucket, cell_ref, q_count FROM zone_qcount WHERE res = ?")
        .raw()
        .iterate(res) as Iterable<any[]>) {
        qCount[bucket][ref] = q;
      }

      const spOff = new Int32Array(maxSid + 2);
      for (const [sid] of db
        .prepare("SELECT species_id FROM zone_species WHERE res = ?")
        .raw()
        .iterate(res) as Iterable<any[]>) {
        spOff[sid + 1]++;
      }
      for (let i = 1; i < spOff.length; i++) spOff[i] += spOff[i - 1];
      const csrRef = new Int32Array(totalRows);
      const csrLvl = new Uint8Array(totalRows);
      const cursor = spOff.slice();
      for (const [sid, ref, lvl] of db
        .prepare("SELECT species_id, cell_ref, bucket_level FROM zone_species WHERE res = ?")
        .raw()
        .iterate(res) as Iterable<any[]>) {
        const p = cursor[sid]++;
        csrRef[p] = ref;
        csrLvl[p] = lvl;
      }

      byRes.set(res, {
        res,
        numRefs: size,
        h3,
        qCount,
        byH3,
        geo: { numRefs: size, samples, lat, lng, spOff, csrRef, csrLvl, counter: new Int32Array(size) },
      });
    }

    db.close();
    this.zonesByRes = byRes;
  }

  get zonesLoaded(): boolean {
    return this.zonesByRes != null;
  }

  /** Resolutions available in the loaded zone data (ascending; coarse → fine). */
  get resolutions(): number[] {
    return this.zonesByRes ? [...this.zonesByRes.keys()].sort((a, b) => a - b) : [];
  }

  /**
   * Lifer count for every H3 cell of `res` inside `bbox` — the data behind the
   * always-on choropleth. Unfiltered by the user's frequency/checklist controls
   * (those apply only to hotspot results); uses bucket 0 (the lowest frequency
   * floor baked
   * into the data) purely to strip one-off vagrant records.
   */
  gridCells(seenIds: Set<number>, res: number, bbox: Bbox): { cells: GridCell[]; maxLifers: number } {
    if (!this.zonesByRes) throw new Error("Zones not loaded");
    const zs = this.zonesByRes.get(res);
    if (!zs) return { cells: [], maxLifers: 0 };
    const q0 = zs.qCount[0];
    const found = allInBbox(zs.geo, { seenIds, qCountForBucket: q0, bucket: 0, bbox });
    let maxLifers = 0;
    const cells: GridCell[] = new Array(found.length);
    for (let i = 0; i < found.length; i++) {
      const { ref, lifers } = found[i];
      if (lifers > maxLifers) maxLifers = lifers;
      cells[i] = { h3: BigInt.asUintN(64, zs.h3[ref]).toString(16), lifers };
    }
    return { cells, maxLifers };
  }

  /** Tally the user's seen species into a zone dataset's scratch counter (bucket 0). */
  private walkSeen(zs: ZoneDataset, seenIds: Set<number>): Int32Array {
    const { spOff, csrRef, counter } = zs.geo;
    counter.fill(0);
    for (const sid of seenIds) {
      if (sid + 1 >= spOff.length) continue;
      const start = spOff[sid];
      const end = spOff[sid + 1];
      for (let i = start; i < end; i++) counter[csrRef[i]]++;
    }
    return counter;
  }

  /**
   * Worldwide quantile breakpoints of lifer counts per resolution — the fixed,
   * personalised colour scale. Returns `n` ascending lifer-count thresholds at
   * evenly spaced quantiles over cells that hold at least one lifer, so the map
   * spreads the full colour spectrum across the actual distribution (a few
   * hyper-rich cells no longer wash everything else to grey) regardless of
   * life-list size. It is worldwide, so panning never recolours; only zooming
   * (which changes resolution) rescales.
   */
  gridQuantiles(seenIds: Set<number>, n = 10): Record<number, number[]> {
    if (!this.zonesByRes) throw new Error("Zones not loaded");
    const out: Record<number, number[]> = {};
    for (const [res, zs] of this.zonesByRes) {
      const counter = this.walkSeen(zs, seenIds);
      const q0 = zs.qCount[0];
      const vals: number[] = [];
      for (let ref = 0; ref < zs.numRefs; ref++) {
        const l = q0[ref] - counter[ref];
        if (l > 0) vals.push(l);
      }
      if (vals.length === 0) {
        out[res] = [1];
        continue;
      }
      vals.sort((a, b) => a - b);
      const breaks: number[] = [];
      for (let i = 1; i <= n; i++) {
        const idx = Math.min(vals.length - 1, Math.max(0, Math.ceil((i / n) * vals.length) - 1));
        breaks.push(vals[idx]);
      }
      out[res] = breaks;
    }
    return out;
  }

  /**
   * Debug/detail for specific cells: cell-level checklist samples, total quality
   * species and lifers (from the zone data, which counts ALL eBird effort), plus
   * how many *named hotspots* actually sit inside each cell. The gap between the
   * two explains why a colourful, data-rich cell can still surface no hotspots:
   * the effort is dispersed across personal locations rather than named spots.
   */
  cellsInfo(seenIds: Set<number>, res: number, h3s: string[]): CellInfo[] {
    if (!this.zonesByRes) throw new Error("Zones not loaded");
    const zs = this.zonesByRes.get(res);
    const cellRefOfLoc = this.locCellRef.get(res);

    // Tally named hotspots (and their checklists) whose precomputed cell_ref
    // (baked in at build time) falls among the requested cells.
    const wantRefs = zs ? new Set(h3s.map((h3) => zs.byH3.get(h3)).filter((ref): ref is number => ref != null)) : null;
    const hotCount = new Map<number, number>();
    const hotLists = new Map<number, number>();
    if (cellRefOfLoc && wantRefs) {
      for (let ref = 0; ref < this.numLocs; ref++) {
        const cellRef = cellRefOfLoc[ref];
        if (cellRef < 0 || !wantRefs.has(cellRef)) continue;
        hotCount.set(cellRef, (hotCount.get(cellRef) ?? 0) + 1);
        hotLists.set(cellRef, (hotLists.get(cellRef) ?? 0) + this.samples[ref]);
      }
    }

    const counter = zs ? this.walkSeen(zs, seenIds) : null;
    const q0 = zs?.qCount[0];
    return h3s.map((h3) => {
      const ref = zs?.byH3.get(h3);
      const hot =
        ref != null
          ? { namedHotspots: hotCount.get(ref) ?? 0, hotspotChecklists: hotLists.get(ref) ?? 0 }
          : { namedHotspots: 0, hotspotChecklists: 0 };
      if (!zs || ref == null || !q0 || !counter) {
        return { h3, samples: 0, totalSpecies: 0, lifers: 0, ...hot };
      }
      const totalSpecies = q0[ref];
      return {
        h3,
        samples: zs.geo.samples[ref],
        totalSpecies,
        lifers: Math.max(0, totalSpecies - counter[ref]),
        ...hot,
      };
    });
  }

  getSpeciesMeta(id: number): SpeciesMeta | undefined {
    return this.speciesById.get(id);
  }
}

// --- singleton, loaded lazily in the background -----------------------------

function lifersDbPath(): string {
  return join(process.env.SQLITE_DIR ?? "/data", OCCURRENCES_DB_FILENAME);
}

let loadPromise: Promise<LifersIndex> | null = null;
let loadError: string | null = null;

function startLoad(): Promise<LifersIndex> {
  const path = lifersDbPath();
  if (!existsSync(path)) {
    loadError = `occurrences.db not found at ${path}`;
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

let occSwapInProgress = false;

/**
 * Zero-downtime reload from a staged occurrences.db.new (uploaded by the
 * aggregator). The replacement index — including zones — is built fully from
 * the staged file before the singleton pointer moves, so in-flight requests
 * keep using the old index and never see a partial load. Peak RSS briefly
 * doubles while both indexes exist.
 */
export async function swapOccurrencesDb(): Promise<
  { ok: true; version: string; locations: number } | { ok: false; error: string }
> {
  if (occSwapInProgress) {
    return { ok: false, error: "Occurrences database swap already in progress" };
  }
  occSwapInProgress = true;
  const livePath = lifersDbPath();
  const newPath = `${livePath}.new`;
  try {
    if (!existsSync(newPath)) {
      return { ok: false, error: `No staged database at ${newPath}` };
    }
    const next = await new Promise<LifersIndex>((resolve, reject) => {
      setImmediate(() => {
        try {
          const index = new LifersIndex(newPath);
          index.loadZones();
          resolve(index);
        } catch (err) {
          reject(err);
        }
      });
    });
    await rename(newPath, livePath);
    next.dbPath = livePath; // handles are closed; only the label needs updating
    loadPromise = Promise.resolve(next);
    loadError = null;
    const version = `${next.versionMonth} ${next.versionYear}`;
    console.log(`Occurrences database swapped to version ${version} (${next.numLocs} locations)`);
    return { ok: true, version, locations: next.numLocs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    occSwapInProgress = false;
  }
}

export type { LifersIndex };
