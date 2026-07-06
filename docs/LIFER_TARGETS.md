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
2. The whole world is shown as a **full-page H3 hexagon choropleth**: every cell
   is coloured by how many of your lifers occur there, on a 10-stop ramp. The
   scale is **fixed and personalised** — mapped through worldwide **quantile
   breakpoints** for the current resolution (`POST /grid-scale`, fetched once),
   so each colour band holds roughly the same share of cells. Lifer counts are
   heavy-tailed (a handful of hyper-rich tropical cells, a long tail of modest
   ones), so a plain linear max would wash everything but the hottest cells to
   grey; equal-count bins spread the full spectrum across the real distribution.
   A 40-species and a 4,000-species list both use the whole ramp, and panning
   never recolours; only zooming (which changes resolution) rescales. Zoom in and
   the hexes get finer (coarse res 3 held across a wide zoom range → fine res 6
   only when zoomed right in). Cells with none of your lifers render subtly.
3. To get **hotspot results**, scope the map: pick one or more eBird **regions**
   (the map frames to their bounds) *or* click one or more **hex cells** (with an
   obvious Clear button). Hex selection takes priority over regions; clearing it
   reverts to the regions; changing zoom resolution drops a stale hex selection.
   There are no worldwide hotspot results — a scope is required.
4. Within that scope, the panel ranks the best hotspots for new lifers, filtered
   by a **minimum frequency** and **minimum checklists**. Those two filters scope
   the hotspot results *only* — never the grid colour (see the note below).

The panel and map are two views of one selection: hovering a hotspot row
highlights its map marker and vice-versa, clicking a row flies to it, clicking a
marker scrolls its row into view.

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
| `zone_meta`    | 469 k  | H3 cell metadata + total checklists, keyed by `(res, cell_ref)` |
| `zone_species` | 46 M   | `(res, species_id, cell_ref, bucket_level)` for zones |
| `zone_qcount`  | 3 M    | precomputed `qCount` per `(res, bucket, cell)` |

The zone tables carry **every H3 resolution** (coarse res 3 → fine res 6) that
`targets.db` provides; `cell_ref` is only unique within a resolution, so all
three zone tables are keyed by `(res, cell_ref)`. The in-memory index loads one
dataset per resolution and the map colours whichever fits the current zoom.

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

- `GET  /status` — index readiness, buckets, version, `zonesLoaded`, and the
  available `resolutions` (e.g. `[3,4,5,6]`).
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
- `POST /region-bounds` — `{ region }` → `{ bbox }` over the region's hotspots,
  for framing the map on selection.
- `POST /hotspots` — `{ species: [{sciName, commonName, code}], frequency,
  minChecklists, region?, bbox?, limit? }` → ranked hotspots.
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

- ~~**Region names for zones.**~~ Done — resolved from the `regions` table,
  plus hotspot-anchored zone names.
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
