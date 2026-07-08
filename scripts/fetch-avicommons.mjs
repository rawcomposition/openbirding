/**
 * Refreshes the committed Avicommons "lite" dataset (https://avicommons.org) at
 * api/data/avicommons-lite.json, which the API loads to attach species photos to
 * results. Format: { "<eBird species code>": ["<photo key>", "<photographer>"] }
 *
 * Run manually (`npm run fetch-avicommons`) when you want newer photos, then
 * commit the updated file.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://avicommons.org/latest-lite.json";
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "api", "data", "avicommons-lite.json");

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`[avicommons] HTTP ${res.status}`);
const body = await res.text();
JSON.parse(body);
await mkdir(dirname(dest), { recursive: true });
await writeFile(dest, body);
console.log(`[avicommons] downloaded ${(body.length / 1024).toFixed(0)} KB to api/data/avicommons-lite.json`);
