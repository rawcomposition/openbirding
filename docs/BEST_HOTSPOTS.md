# Best Hotspots

A tool that takes a birder's eBird life list and finds the places — individual
hotspots or geographic zones — where they can see the most species they haven't
recorded yet ("lifers"), filtered by how frequently each species is reported and
how well-sampled the location is.

No other birding app does this at global scale. It responds in tens of
milliseconds.

- **Bird Finder** (existing): pick one species → where is it?
- **Best Hotspots** (new): upload your whole life list → where should I go?

---

## What it does

1. Upload an eBird life-list CSV (parsed in the browser). The parsed list is
   stored server-side (`life_lists` in the main DB) under an anonymous UUID
   token the client keeps in localStorage — so revisits restore instantly and
   every query sends the ~40-byte token instead of a ~100 KB species payload.
   Clearing the list deletes the server-side copy.
2. The whole world is shown as a **full-page H3 hexagon choropleth**: every cell
   is coloured by how many of your lifers occur there, on a 10-stop ramp. The
   scale is **fixed and personalised** — mapped through worldwide **quantile
   breakpoints** for the current resolution (`POST /grid-scale`, fetched once),
   so each colour band holds roughly the same share of cells. Lifer counts are
   heavy-tailed (a handful of hyper-rich tropical cells, a long tail of modest
   ones), so a plain linear max would wash everything but the hottest cells to
   grey; equal-count bins spread the full spectrum across the real distribution.
   A 40-species and a 4,000-species list both use the whole ramp, and panning
   never recolours; only zooming (which changes resolution) rescales. Zoom in
   and the hexes get finer (res 3 wide out, res 4 zoomed in). Cells with none
   of your lifers render subtly.
3. Hotspot results are **always on**: by default they rank the best hotspots in
   the **current map viewport** (every settled pan/zoom refetches — pan to
   Colombia, see Colombia's best). Clicking one or more **hex cells** narrows
   the results to just those cells (with an obvious Clear button); changing
   zoom resolution drops a stale hex selection. There is no separate region
   picker — the viewport *is* the region.
4. Within that scope, a full-height docked sidebar ranks the top 100 hotspots
   for new lifers, filtered by a **minimum frequency** and **minimum
   checklists**. Those two filters scope the hotspot results *only* — never the
   grid colour (see the note below). The results list scrolls independently;
   the sidebar collapses to give the map the whole screen.

Hovering a hotspot row highlights it on the map and clicking a row pans (never
zooms — that would change the grid resolution and drop a hex selection) to it.

### Why the filters don't touch the grid colour

A frequency threshold means different things at a hotspot vs. across a hex cell:
a cell's frequency is diluted by however much *other* birding happened inside it
(effort, not bird quality), and that dilution grows with cell size, so the same
"20%" is not portable and shifts as you zoom. So the grid answers "how many of
your lifers occur here at all" (a fixed >=1% floor strips one-off vagrants) and
is normalised to a fixed worldwide quantile scale; the frequency/checklist knobs
live with the hotspot drill-down, where a percentage cleanly means "your odds on
a visit".

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

### The companion database: `occurrences.db`

Built from the read-only `targets.db` by **the aggregator repo's
`generate_occurrences.py`** — a step in its CLI pipeline ("Build Occurrences
DB", also part of "All"), run at the same cadence as the targets build and
uploaded alongside targets.db by its Upload SQLite step. The source is
attached read-only and a fresh `occurrences.db` is written. Tables:

| Table          | Rows   | Purpose |
|----------------|--------|---------|
| `species`      | 11 k   | id ↔ code / common / scientific name for resolution |
| `loc_meta`     | 293 k  | hotspot metadata + total checklists, keyed by dense `loc_ref` |
| `loc_species`  | 20 M   | `(species_id, loc_ref, bucket_level)` — species→location index |
| `loc_qcount`   | 2 M    | precomputed `qCount` per (bucket, location) |
| `zone_meta`    | 469 k  | H3 cell metadata + total checklists, keyed by `(res, cell_ref)` |
| `zone_species` | 46 M   | `(res, species_id, cell_ref, bucket_level)` for zones |
| `zone_qcount`  | 3 M    | precomputed `qCount` per `(res, bucket, cell)` |

The zone tables carry H3 **res 3 and 4**, rolled up by the build script from
the finest resolution in `targets.db` (res 6 — the only one it stores; finer
than 4 is too fine for this UI and was ~85% of the zone rows). The API-side cap
is `OCCURRENCES_MAX_ZONE_RES` in `api/lib/config.ts`; the build-side list is
`--zone-res` (default `3,4`) in `generate_occurrences.py`.
`cell_ref` is only unique within a resolution, so all three zone tables are
keyed by `(res, cell_ref)`. The in-memory index loads one dataset per
resolution and the map colours whichever fits the current zoom.

`bucket_level` is the frequency threshold quantized to an integer 0–6, so the
in-memory index needs no float math.

A `blob_cache` table (written at the end of the same build) holds the same
data pre-packed as little-endian typed-array BLOBs. The API loads those with a
few memcpy-speed reads (~0.5 s total) instead of iterating tens of millions of
rows through the JS statement cursor (~60 s, which blocked the whole event
loop). The exact blob layout is documented in `generate_occurrences.py` and
consumed by `api/lib/occurrences-index.ts` — **keep the two in sync**. The row
tables remain the source of truth; the loader falls back to iterating them if
`blob_cache` is absent.

### The in-memory index

At API startup (`api/lib/occurrences-index.ts`) the whole thing is loaded into
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

**Hotspots load eagerly (~0.5 s at boot); zones follow in the background
(~1 s)** via the packed blobs, so a restarted server is fully warm in under
two seconds.

### Frequency thresholds are bucketed

Users choose from presets **5% / 10% / 20% / 30% / 50%** (fraction of
checklists). These are the buckets baked into `occurrences.db`; 5% is also the
hotspot data floor (rows below it are dropped at build time). The grid keeps
its own permissive 1% floor — cell-level frequency is diluted by unrelated
effort, so hotspot presets don't translate to cells. `minChecklists` is fully
dynamic (a per-location filter, floor 25), not bucketed.

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
time for `occurrences.db` is ~3.5 minutes plus ~1 minute of blob packing
(`occurrences.db` grows ~1.1 → ~1.5 GB with the blobs).

Memory: ~570 MB RSS with res 3+4 loaded (~1 GB if res 5/6 are re-enabled via
`OCCURRENCES_MAX_ZONE_RES`). The hotspot index is now the dominant share.

---

## API

All under `/api/v1/best-hotspots`. Species are matched by code → scientific name →
common name → base-binomial fallback. Every query endpoint accepts either an
inline `species` array or a `listToken` referencing a stored list (the normal
path).

- `POST /list` — `{ species, fileName?, token? }` → `{ token, count, matched,
  unmatchedCount }`. Stores (or, with a valid `token`, replaces) a life list
  under an anonymous UUID. `GET /list/:token` returns its metadata (a 404 tells
  a returning client to prompt a re-upload); `DELETE /list/:token` removes it.
- `GET  /status` — index readiness, buckets, version, `zonesLoaded`, and the
  available `resolutions` (e.g. `[3,4]`).
- `POST /grid` — `{ species, bbox, resolution }` → `{ resolution, cells:
  [{h3, lifers}], maxLifers }`. The always-on choropleth; unfiltered by
  frequency/checklists. Called on every settled pan/zoom, so it is lean (no
  region-name enrichment, no citation).
- `POST /grid-scale` — `{ species }` → `{ breaksByRes }`, ten ascending
  worldwide quantile breakpoints of lifer counts per resolution. Fetched once
  per life list to fix the colour scale (equal-count colour bands).
- `POST /cells` — `{ species, resolution, cells: [h3] }` → per-cell
  `{ h3, samples, totalSpecies, lifers, namedHotspots, hotspotChecklists }`.
  Backs the selected-hex debug readout. `samples`/`lifers` count **all** eBird
  effort in the cell; `namedHotspots`/`hotspotChecklists` count only named
  hotspots inside it — the gap explains why a data-rich, colourful cell can
  still surface no hotspots (effort dispersed across personal locations).
- `POST /hotspots` — `{ listToken | species, frequency, minChecklists,
  region?, bbox?, limit? }` → ranked hotspots. The UI always sends the viewport
  (or hex-selection) `bbox`; `region` filtering remains available to API
  consumers.
- `POST /hotspot/:locationId` — the specific lifer species at one hotspot.
- `POST /zones` — same body → ranked H3 zones (finest resolution).
- `POST /zone/:cellRef` — the specific lifer species in one zone. NOTE: keyed by
  `cell_ref` alone, so it is ambiguous now that `targets.db` carries multiple
  resolutions; not used by the current full-page UI.

Items carry a human-readable `regionName` (resolved from the `regions` table,
walking up the code hierarchy for unknown sub-codes) and zones carry an
`anchorHotspot` — the most-birded hotspot within 4 km of the cell center, found
via a 0.5° spatial grid built over the hotspot index at load.

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

- ~~**Region names for zones.**~~ Obsolete — the zone endpoints were removed
  with the old Hot Zones UI, and `zone_meta` no longer carries a region code at
  all (hotspot rows have their own, which is what the results list shows).
- ~~**Render zones as hexagons.**~~ Done — superseded by the full-page grid:
  an always-on multi-resolution H3 choropleth (`h3-js` boundaries, antimeridian
  unwrap), coloured by lifer count and normalised per view.
- **Grid dilution, decided.** The grid deliberately does *not* apply the user's
  frequency filter (see "Why the filters don't touch the grid colour"). A
  future refinement, if a diluted-but-rich cell ever needs to surface better, is
  a peak-preserving rollup: colour a coarse cell from its best/hottest child
  cells (or the best hotspot inside it) instead of its flat average, since the
  resolution pyramid (res 3–6) is already stored. Not needed yet.
- **`/zone/:cellRef` is resolution-ambiguous.** Add a `res` (or use the h3
  index) if per-cell species detail is ever wired back into the UI.
- **Month filter.** The month-partitioned data exists (`h3_cell_*`, `month_obs`)
  — a "planning a trip in October" filter is very doable but would need
  per-month buckets (bigger `occurrences.db`) or an on-the-fly path.
- **"Trip" aggregation.** Combine several nearby zones into a route and show the
  combined lifer total.
- ~~**Rebuild cadence.**~~ Done — `occurrences.db` is built and uploaded by the
  aggregator pipeline whenever `targets.db` is refreshed, and hot-swapped via
  `POST /api/v1/admin/swap-occurrences-db` (no restart; RSS briefly doubles
  while the replacement index builds).
- **Very large life lists** (10k+ species) persist to `localStorage`; if it
  exceeds quota the tool still works for the session but won't remember the list.
  Consider IndexedDB if this becomes common.

---

## Deploying

1. Build via the aggregator CLI ("Build Occurrences DB", or as part of "All"):
   `python3 generate_occurrences.py <targets.db> <occurrences.db>`.
2. The aggregator's "Upload SQLite" step stages `occurrences.db.new` on the VPS
   data volume alongside `targets.db.new`, then hot-swaps both via the admin
   API (`swap-targets-db`, then `swap-occurrences-db` — the second URL is
   derived from `DB_SWAP_ENDPOINT`). No restart needed. (Manual alternative:
   place `occurrences.db` in `SQLITE_DIR` and restart.)
3. Start the API — the index warms automatically (~0.5 s hotspots + ~0.1 s
   zones from the blob cache). `GET /api/v1/best-hotspots/status` reports readiness.
