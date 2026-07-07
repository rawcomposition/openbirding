export type LifeListEntry = { sciName: string; commonName: string };

export type ParsedLifeList = {
  entries: LifeListEntry[];
  rowCount: number;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export class EbirdCsvError extends Error {}

export function parseEbirdCsv(text: string): ParsedLifeList {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) {
    throw new EbirdCsvError("This file doesn't look like an eBird export (no data rows found).");
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const sciIdx = header.findIndex((h) => h === "scientific name");
  const commonIdx = header.findIndex((h) => h === "common name");
  const categoryIdx = header.findIndex((h) => h === "category");
  const countableIdx = header.findIndex((h) => h === "countable");

  if (sciIdx === -1 && commonIdx === -1) {
    throw new EbirdCsvError(
      'Could not find a "Scientific Name" or "Common Name" column. Export your life list from eBird → Download My Data.'
    );
  }

  const nonSpeciesCategories = new Set(["slash", "spuh", "hybrid"]);

  const seen = new Set<string>();
  const entries: LifeListEntry[] = [];
  for (const r of rows.slice(1)) {
    if (countableIdx !== -1) {
      const countable = r[countableIdx]?.trim().toLowerCase() ?? "";
      if (countable === "0" || countable === "no" || countable === "false") continue;
    }
    if (categoryIdx !== -1) {
      const category = r[categoryIdx]?.trim().toLowerCase() ?? "";
      if (nonSpeciesCategories.has(category)) continue;
    }
    const sciName = (sciIdx !== -1 ? r[sciIdx] : "")?.trim() ?? "";
    const commonName = (commonIdx !== -1 ? r[commonIdx] : "")?.trim() ?? "";
    if (!sciName && !commonName) continue;
    const key = (sciName || commonName).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ sciName, commonName });
  }

  if (entries.length === 0) {
    throw new EbirdCsvError("No species found in this file.");
  }

  return { entries, rowCount: rows.length - 1 };
}
