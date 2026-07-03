# Lifer Targets & Hot Zones

A tool that takes a birder's eBird life list and finds the places — individual
hotspots or geographic zones — where they can see the most species they haven't
recorded yet ("lifers"), filtered by how frequently each species is reported and
how well-sampled the location is.

No other birding app does this at global scale. It responds in tens of
milliseconds.

- **Bird Finder** (existing): pick one species → where is it?
- **Lifer Targets** (new): upload your whole life list → where should I go?

---

## What it does

1. Upload an eBird life-list CSV (parsed entirely in the browser — never stored
   server-side).
2. Pick a **minimum frequency** (how likely a species is at a place) and a
   **minimum number of checklists** (to ignore under-sampled "nonsense"
   locations), optionally scoped to an eBird **region**.
3. Get a ranked, mapped list of either:
   - **Hotspots** — individual eBird hotspots, or
   - **Zones** — ~36 km² H3 hexagons ("if I bird this whole area…"), better for
     trip planning.
4. Expand any result to see the exact potential lifers, most-likely first.

---

## How it works (architecture)

### The core insight

The number of lifers at a location is:

```
lifers[loc] = qCount[loc] − seenCount[loc]
```

- `qCount[loc]` = number of species at `loc` above the frequency threshold
  (**user-independent** → precomputable).
- `seenCount[loc]` = how many of those the user has already seen
  (**user-specific**, but only touches the user's ~few-hundred–few-thousand
  species).

This flips a brutal 36M-row `GROUP BY` (≈4–9 s worldwide) into two small indexed
scans. We precompute `qCount` per location at a fixed set of frequency
thresholds; at query time we only walk the user's seen species.

### The companion database: `lifers.db`

Built from the 12 GB read-only `targets.db` by
`api/scripts/build-lifers-db.ts`. It is **never** modified in place — the source
is attached read-only and a fresh `lifers.db` (~760 MB) is written. Tables:

| Table          | Rows   | Purpose |
|----------------|--------|---------|
| `species`      | 11 k   | id ↔ code / common / scientific name for resolution |
| `loc_meta`     | 293 k  | hotspot metadata + total checklists, keyed by dense `loc_ref` |
| `loc_species`  | 20 M   | `(species_id, loc_ref, bucket_level)` — species→location index |
| `loc_qcount`   | 2 M    | precomputed `qCount` per (bucket, location) |
| `zone_meta`    | 305 k  | H3 cell metadata + total checklists |
| `zone_species` | 28 M   | `(species_id, cell_ref, bucket_level)` for zones |
| `zone_qcount`  | 2 M    | precomputed `qCount` per (bucket, cell) |

`bucket_level` is the frequency threshold quantized to an integer 0–6, so the
in-memory index needs no float math.

### The in-memory index

At API startup (`api/lib/lifers-index.ts`) the whole thing is loaded into
compact typed arrays:

- Per-location metadata arrays (samples, lat/lng, region code).
- `qCount[bucket]` as `Int32Array`s.
- A **compressed-sparse-row (CSR)** species→location index (`spOff`, `csrRef`,
  `csrLvl`) — ~100 MB for hotspots, ~140 MB for zones.

A query (`api/lib/geo-query.ts`) then:

1. Walks only the user's seen species through the CSR, incrementing a `counter`
   per location.
2. Scans locations once, computing `qCount − counter`, keeping the top-K in a
   bounded min-heap.

**Hotspots load eagerly (~17 s at boot); zones load lazily in the background**
so nothing blocks startup and users never wait.

### Frequency thresholds are bucketed

Users choose from presets **1% / 3% / 5% / 10% / 20% / 30% / 50%** (fraction of
checklists). These are the buckets baked into `lifers.db`. `minChecklists` is
fully dynamic (a per-location filter), not bucketed.

---

## Performance

Measured on the full worldwide dataset with a 388-species life list:

| Query                         | Time |
|-------------------------------|------|
| Worldwide hotspots, 5%, ck≥50 | ~50 ms |
| Worldwide hotspots, 1%, ck≥20 | ~25 ms |
| Region-filtered (US-CA)       | ~30 ms |
| Worldwide zones, 5%, ck≥50    | ~40 ms |
| Hotspot / zone species detail | ~5 ms |

Compared to the naive SQL approach (4–9 s), this is a 100–400× speedup. Build
time for `lifers.db` is ~3.5 minutes.

Memory: hotspots ~100 MB + zones ~140 MB resident, comfortably within the
24 GB VPS.

---

## API

All under `/api/v1/lifers`. Species are matched by code → scientific name →
common name → base-binomial fallback.

- `GET  /status` — index readiness, buckets, version, `zonesLoaded`.
- `POST /hotspots` — `{ species: [{sciName, commonName, code}], frequency,
  minChecklists, region?, bbox?, limit? }` → ranked hotspots.
- `POST /hotspot/:locationId` — the specific lifer species at one hotspot.
- `POST /zones` — same body → ranked H3 zones.
- `POST /zone/:cellRef` — the specific lifer species in one zone.

`frequency` accepts a fraction (`0.05`) or a percent (`5`); it snaps to the
nearest bucket.

---

## Notable findings / decisions

- **`samples` is per-location, constant across species** in `year_obs` — it is
  the total checklist count at that location, which is exactly the "min
  checklists" filter the user wanted.
- **Hotspots use adjusted frequency (`score`)**; **zones use raw frequency**
  (`obs/samples`) because the H3 tables only carry raw observation counts. Worth
  unifying if it ever matters, but both are reasonable "how likely" signals.
- **SQLite `HAVING` alias-collision bug (fixed):** `SELECT SUM(samples) AS
  samples ... HAVING samples >= 10` binds `samples` to the raw *column*, not the
  aggregate alias. This silently dropped ~⅔ of valid zones (97 k vs 305 k) until
  the aggregate was aliased to a distinct name. The location table happened to
  be immune because `samples` is constant per group there.
- **Results validate against intuition:** for a mostly-California life list, the
  top targets are Amazonian and Andean lodges (Rio Cristalino, Manu, Los
  Amigos), which is exactly right.

---

## Follow-ups / ideas

- **Region names for zones.** Zones are labelled "Zone near VE-F" (raw eBird
  region code). Resolve to human names via the `regions` table for nicer labels.
- **Render zones as hexagons** on the map (currently plotted as points at the
  cell center). Needs `h3-js` on the client to compute cell boundaries from the
  H3 index (already returned as hex in the API).
- **Month filter.** The month-partitioned data exists (`h3_cell_*`, `month_obs`)
  — a "planning a trip in October" filter is very doable but would need
  per-month buckets (bigger `lifers.db`) or an on-the-fly path.
- **"Trip" aggregation.** Combine several nearby zones into a route and show the
  combined lifer total.
- **Rebuild cadence.** `lifers.db` must be rebuilt whenever `targets.db` is
  refreshed. Wire `npx tsx api/scripts/build-lifers-db.ts` into the same
  pipeline that regenerates `targets.db`, then hot-swap (mirror the existing
  `swapTargetsDb` retire-on-idle pattern if zero-downtime swap is needed).
- **Very large life lists** (10k+ species) persist to `localStorage`; if it
  exceeds quota the tool still works for the session but won't remember the list.
  Consider IndexedDB if this becomes common.

---

## Deploying

1. Build the companion DB next to `targets.db`:
   `cd api && npx tsx scripts/build-lifers-db.ts`
   (honors `TARGETS_DB` / `LIFERS_DB` env overrides; defaults to the web root).
2. Ensure `lifers.db` sits in `SQLITE_DIR` (same dir as `targets.db`).
3. Start the API — the index warms automatically. `GET /api/v1/lifers/status`
   reports readiness.
