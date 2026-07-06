/**
 * Pack occurrences.db's big row tables into typed-array BLOBs (a `blob_cache` table)
 * so the API can load its in-memory index with a handful of memcpy-speed blob
 * reads instead of iterating ~66M rows through the JS statement cursor.
 *
 * This cuts index load from ~60s (which blocks the whole event loop) to ~1-2s.
 * The row tables are kept — they remain the source of truth and the loader
 * falls back to them when blob_cache is absent.
 *
 * Runs standalone (`npx tsx scripts/pack-occurrences-blobs.ts`) and is invoked at
 * the end of build-occurrences-db.ts.
 */
import Database from "better-sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function asBuf(arr: Int32Array | Float32Array | Uint8Array | BigInt64Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

export function packOccurrencesBlobs(dbPath: string, log: (msg: string) => void = console.log): void {
  const db = new Database(dbPath);
  // WAL so packing can run alongside a live API server holding read
  // connections (a running server won't see the blobs until it restarts).
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF");
  db.pragma("cache_size = -500000");
  db.pragma("busy_timeout = 60000");

  db.exec(`
    DROP TABLE IF EXISTS blob_cache;
    CREATE TABLE blob_cache (key TEXT PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID;
  `);
  const put = db.prepare("INSERT INTO blob_cache (key, data) VALUES (?, ?)");
  const buckets = JSON.parse((db.prepare("SELECT buckets FROM metadata").get() as any).buckets) as number[];

  // --- Hotspot (location) arrays --------------------------------------------
  {
    const n = (db.prepare("SELECT COUNT(*) c FROM loc_meta").get() as any).c as number;
    const maxSid = (db.prepare("SELECT MAX(species_id) m FROM loc_species").get() as any).m as number;
    const totalRows = (db.prepare("SELECT COUNT(*) c FROM loc_species").get() as any).c as number;
    log(`packing hotspots: ${n} locations, ${totalRows} loc_species rows`);

    const samples = new Int32Array(n);
    const lat = new Float32Array(n);
    const lng = new Float32Array(n);
    for (const [ref, la, ln, s] of db
      .prepare("SELECT loc_ref, lat, lng, samples FROM loc_meta")
      .raw()
      .iterate() as Iterable<any[]>) {
      samples[ref] = s;
      lat[ref] = la;
      lng[ref] = ln;
    }

    // qCount for all buckets, concatenated: bucket b occupies [b*n, (b+1)*n).
    const qCount = new Int32Array(buckets.length * n);
    for (const [bucket, ref, q] of db
      .prepare("SELECT bucket, loc_ref, q_count FROM loc_qcount")
      .raw()
      .iterate() as Iterable<any[]>) {
      qCount[bucket * n + ref] = q;
    }

    // CSR species -> locations: count per species, prefix-sum, fill.
    const spOff = new Int32Array(maxSid + 2);
    const csrRef = new Int32Array(totalRows);
    const csrLvl = new Uint8Array(totalRows);
    for (const [sid] of db.prepare("SELECT species_id FROM loc_species").raw().iterate() as Iterable<any[]>) {
      spOff[sid + 1]++;
    }
    for (let i = 1; i < spOff.length; i++) spOff[i] += spOff[i - 1];
    const cursor = spOff.slice();
    for (const [sid, ref, lvl] of db
      .prepare("SELECT species_id, loc_ref, bucket_level FROM loc_species")
      .raw()
      .iterate() as Iterable<any[]>) {
      const p = cursor[sid]++;
      csrRef[p] = ref;
      csrLvl[p] = lvl;
    }

    put.run("loc:samples", asBuf(samples));
    put.run("loc:lat", asBuf(lat));
    put.run("loc:lng", asBuf(lng));
    put.run("loc:qcount", asBuf(qCount));
    put.run("loc:spOff", asBuf(spOff));
    put.run("loc:csrRef", asBuf(csrRef));
    put.run("loc:csrLvl", asBuf(csrLvl));
  }

  // --- Zone (H3) arrays, one set per resolution ------------------------------
  const resList = (db.prepare("SELECT DISTINCT res FROM zone_meta ORDER BY res").all() as any[]).map(
    (r) => r.res as number
  );
  for (const res of resList) {
    const size =
      ((db.prepare("SELECT MAX(cell_ref) m FROM zone_meta WHERE res = ?").get(res) as any).m as number) + 1;
    const maxSid = (db.prepare("SELECT MAX(species_id) m FROM zone_species WHERE res = ?").get(res) as any)
      .m as number;
    const totalRows = (db.prepare("SELECT COUNT(*) c FROM zone_species WHERE res = ?").get(res) as any)
      .c as number;
    log(`packing zones res ${res}: ${size} cells, ${totalRows} zone_species rows`);

    const samples = new Int32Array(size);
    const lat = new Float32Array(size);
    const lng = new Float32Array(size);
    const h3 = new BigInt64Array(size);
    for (const [ref, hh, la, ln, s] of db
      .prepare("SELECT cell_ref, h3, lat, lng, samples FROM zone_meta WHERE res = ?")
      .raw()
      .safeIntegers()
      .iterate(res) as Iterable<any[]>) {
      const r = Number(ref);
      samples[r] = Number(s);
      lat[r] = Number(la);
      lng[r] = Number(ln);
      h3[r] = typeof hh === "bigint" ? hh : BigInt(hh);
    }

    const qCount = new Int32Array(buckets.length * size);
    for (const [bucket, ref, q] of db
      .prepare("SELECT bucket, cell_ref, q_count FROM zone_qcount WHERE res = ?")
      .raw()
      .iterate(res) as Iterable<any[]>) {
      qCount[bucket * size + ref] = q;
    }

    const spOff = new Int32Array(maxSid + 2);
    const csrRef = new Int32Array(totalRows);
    const csrLvl = new Uint8Array(totalRows);
    for (const [sid] of db
      .prepare("SELECT species_id FROM zone_species WHERE res = ?")
      .raw()
      .iterate(res) as Iterable<any[]>) {
      spOff[sid + 1]++;
    }
    for (let i = 1; i < spOff.length; i++) spOff[i] += spOff[i - 1];
    const cursor = spOff.slice();
    for (const [sid, ref, lvl] of db
      .prepare("SELECT species_id, cell_ref, bucket_level FROM zone_species WHERE res = ?")
      .raw()
      .iterate(res) as Iterable<any[]>) {
      const p = cursor[sid]++;
      csrRef[p] = ref;
      csrLvl[p] = lvl;
    }

    put.run(`zone:${res}:samples`, asBuf(samples));
    put.run(`zone:${res}:lat`, asBuf(lat));
    put.run(`zone:${res}:lng`, asBuf(lng));
    put.run(`zone:${res}:h3`, asBuf(h3));
    put.run(`zone:${res}:qcount`, asBuf(qCount));
    put.run(`zone:${res}:spOff`, asBuf(spOff));
    put.run(`zone:${res}:csrRef`, asBuf(csrRef));
    put.run(`zone:${res}:csrLvl`, asBuf(csrLvl));
  }

  // Fold the WAL back into the main file and restore rollback-journal mode so
  // the packed DB stays a single file. Best-effort: mode can't change while
  // another connection is open, and WAL is harmless to leave behind.
  db.pragma("wal_checkpoint(TRUNCATE)");
  try {
    db.pragma("journal_mode = DELETE");
  } catch {
    log("note: another connection is open; leaving journal_mode = WAL");
  }
  db.close();
  log("blob_cache packed.");
}

// Run directly: pack the default (or env-overridden) occurrences.db.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const webDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const path = process.env.OCCURRENCES_DB ?? join(webDir, "occurrences.db");
  const start = Date.now();
  packOccurrencesBlobs(path, (m) => console.log(`[pack-occurrences] ${m}`));
  console.log(`[pack-occurrences] done in ${((Date.now() - start) / 1000).toFixed(1)}s (${path})`);
}
