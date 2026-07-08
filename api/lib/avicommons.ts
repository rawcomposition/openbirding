import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type AvicommonsLite = Record<string, [photoKey: string, by: string]>;
export type SpeciesPhoto = { url: string; by: string };

const CDN = "https://static.avicommons.org";
const jsonPath = process.env.AVICOMMONS_JSON_PATH ?? join(process.cwd(), "data", "avicommons-lite.json");

let data: AvicommonsLite = {};
if (existsSync(jsonPath)) {
  try {
    data = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch (err) {
    console.warn(`[avicommons] failed to parse ${jsonPath}: ${err instanceof Error ? err.message : err}`);
  }
} else {
  console.warn(`[avicommons] ${jsonPath} not found — species photos will be omitted`);
}

export function speciesPhoto(code: string, size: 160 | 240 | 320 | 480 | 900 = 160): SpeciesPhoto | null {
  const entry = data[code];
  if (!entry) return null;
  return { url: `${CDN}/${code}-${entry[0]}-${size}.jpg`, by: entry[1] };
}
