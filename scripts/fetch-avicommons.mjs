/**
 * Downloads the Avicommons "lite" dataset (https://avicommons.org) into
 * client/public so the app can show species thumbnails. Format:
 *   { "<eBird species code>": ["<photo key>", "<photographer>"] }
 * Thumbnail URLs: https://static.avicommons.org/{code}-{key}-{size}.jpg
 *
 * Runs automatically before `npm run dev` / `npm run build`; skips the
 * download when a copy from the last 30 days is already present.
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://avicommons.org/latest-lite.json";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "public", "avicommons-lite.json");

const fresh = await stat(dest)
  .then((s) => Date.now() - s.mtimeMs < MAX_AGE_MS)
  .catch(() => false);
if (fresh) {
  console.log("[avicommons] cached copy is fresh — skipping download");
  process.exit(0);
}

try {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  JSON.parse(body); // fail loudly on a partial/HTML response
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, body);
  console.log(`[avicommons] downloaded ${(body.length / 1024).toFixed(0)} KB to client/public/avicommons-lite.json`);
} catch (err) {
  const have = await stat(dest).then(() => true).catch(() => false);
  console.warn(`[avicommons] download failed (${err.message}) — ${have ? "keeping stale copy" : "no thumbnails will show"}`);
  // Never fail dev/build over missing thumbnails.
}
