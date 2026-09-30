# OpenBirding API (Rust)

Drop-in replacement for `../api` (Hono/Node): same routes, JSON shapes, status codes and validation messages, served by axum on a multi-threaded runtime. SQLite work runs on pooled connections inside `spawn_blocking`, so a slow query no longer blocks other requests.

## Run

```sh
cp .env.example .env   # fill in secrets
cargo run --release    # same as `cargo run --release -- serve`
```

Configuration comes from the environment (or `.env`): see `.env.example`. `SQLITE_DIR` + `SQLITE_FILENAME` locate `openbirding.db`; `targets.db` and `occurrences.db` live in `SQLITE_DIR`. `PORT` defaults to 3000.

## Maintenance commands

```sh
openbirding-api sync-regions
openbirding-api generate-region-parents [prefix]
openbirding-api health-check
```

## Differences from the Node API

- Admin and backup routes reject every request when `CRON_SECRET` is unset; secrets are compared in constant time.
- HTML reports escape database values.
- 500 responses return `{"message":"Internal Server Error"}`; details go to the log.
- `openbirding.db` is switched to WAL mode so both servers can write to it while they run side by side.
- CORS preflights omit the stray `content-type: text/plain` header that @hono/node-server adds to 204s.

## Running beside the Node API

Both servers can share `/data`. The first server whose swap endpoint is called renames `*.db.new` over the live file; every other server's swap endpoint then reloads the live file when its `metadata.generated_at` differs from the loaded one. Call the Node server first: it cannot reload without a staged file. The aggregator's `DB_SWAP_ENDPOINT` accepts a comma-separated list for this.

## Deploy

Build from the `web/` directory; the image downloads the Avicommons photo index from `https://avicommons.org/latest-lite.json` at build time:

```sh
docker build -f api-rust/Dockerfile -t openbirding-api-rust .
```

`api-rust/Dockerfile.dockerignore` limits the build context to the crate (the multi-GB databases in `web/` are excluded). Mount the data volume at `/data`.

## Verification

- `cargo test` covers validators, JS number semantics, bucket selection, species resolution, the CSR hotspot/zone queries, relative times and auth parsing.
- `parity/run.mjs` replays ~140 requests (every route, validation errors, large life lists, antimeridian boxes, 3000-cell h3 bodies, life-list create/update/delete flows) against both servers and diffs the JSON:

```sh
DATA_DIR=/path/to/data CRON_SECRET=... REPORTS_PASS=... node parity/run.mjs
```

Set `NODE_URL`/`RUST_URL` to override `http://localhost:3000` / `http://localhost:3001`, and `PARITY_EBIRD=0` to skip routes that call eBird.
