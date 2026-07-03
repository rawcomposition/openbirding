import { HTTPException } from "hono/http-exception";

const LIMIT_DEFAULT = 200;
const LOCATION_IDS_MAX = 500;
const H3_CELLS_MAX = 3000;
const REGION_CODE_RE = /^[A-Z]{2}(?:-[A-Z0-9]{1,3}){0,2}$/;
const LOCATION_ID_RE = /^L\d+$/;
const H3_INDEX_RE = /^[0-9a-f]{15}$/;

export type BoundingBox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export function isLocationId(id: string): boolean {
  return LOCATION_ID_RE.test(id);
}

export function parseMonthsParam(rawMonths: string | undefined | null): number[] | null {
  if (!rawMonths) {
    return null;
  }

  const months = [...new Set(rawMonths.split(",").map(Number))].sort((a, b) => a - b);
  if (months.some((month) => Number.isNaN(month) || month < 1 || month > 12)) {
    throw new HTTPException(400, { message: "months must be comma-separated values between 1 and 12" });
  }

  return months;
}

export function parseMonthsBody(value: unknown): number[] | null {
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new HTTPException(400, { message: "months must be a non-empty array of values between 1 and 12" });
  }
  return parseMonthsParam(value.join(","));
}

export function parseH3Cells(value: unknown): bigint[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HTTPException(400, { message: "cells must be a non-empty array of H3 cell indexes" });
  }
  if (value.length > H3_CELLS_MAX) {
    throw new HTTPException(400, {
      message: `cells cannot contain more than ${H3_CELLS_MAX} cells — use an eBird region for areas this large`,
    });
  }

  const cells = value.map((item) => {
    const cell = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (!H3_INDEX_RE.test(cell)) {
      throw new HTTPException(400, { message: "cells must contain H3 cell indexes like 86be8d92fffffff" });
    }
    return BigInt(`0x${cell}`);
  });

  return [...new Set(cells)];
}

export function parseRegionCodes(rawRegions: string): string[] {
  const rawCodes = rawRegions.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (rawCodes.length === 0) {
    throw new HTTPException(400, { message: "At least one region code is required" });
  }
  if (rawCodes.length > 20) {
    throw new HTTPException(400, { message: "Maximum 20 region codes allowed" });
  }
  if (rawCodes.some((code) => !REGION_CODE_RE.test(code))) {
    throw new HTTPException(400, {
      message: "regionCode must be comma-separated eBird region codes like US, US-CA, or US-CA-065",
    });
  }

  const sorted = [...new Set(rawCodes)].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const regionCodes: string[] = [];
  for (const code of sorted) {
    const coveredByParent = regionCodes.some((parent) => code.startsWith(parent + "-"));
    if (!coveredByParent) {
      regionCodes.push(code);
    }
  }

  return regionCodes;
}

export function parseLimit(value: string | number | undefined | null): number {
  const normalized = value != null ? Number(value) : LIMIT_DEFAULT;
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new HTTPException(400, { message: "limit must be a positive number" });
  }
  return normalized;
}

export function parseMonth(value: string | number | undefined | null): number | null {
  if (value == null) {
    return null;
  }
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new HTTPException(400, { message: "month must be between 1 and 12" });
  }
  return month;
}

export function parseMinObservations(value: string | number | undefined | null): number | null {
  if (value == null) {
    return null;
  }
  const minObservations = Number(value);
  if (!Number.isInteger(minObservations) || minObservations < 1) {
    throw new HTTPException(400, { message: "minObservations must be a positive number" });
  }
  return minObservations;
}

export function parseBBoxParam(value: string | undefined | null): BoundingBox | null {
  if (!value) {
    return null;
  }

  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    throw new HTTPException(400, { message: "bbox must be minLng,minLat,maxLng,maxLat" });
  }

  return { minLng: parts[0], minLat: parts[1], maxLng: parts[2], maxLat: parts[3] };
}

export function parseBBoxBody(value: unknown): BoundingBox | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "object") {
    throw new HTTPException(400, { message: "bbox must be an object with minLng,minLat,maxLng,maxLat" });
  }

  const candidate = value as Record<string, unknown>;
  const minLng = Number(candidate.minLng);
  const minLat = Number(candidate.minLat);
  const maxLng = Number(candidate.maxLng);
  const maxLat = Number(candidate.maxLat);

  if ([minLng, minLat, maxLng, maxLat].some((part) => Number.isNaN(part))) {
    throw new HTTPException(400, { message: "bbox must be an object with minLng,minLat,maxLng,maxLat" });
  }

  return { minLng, minLat, maxLng, maxLat };
}

export function parseLocationIds(value: unknown): string[] | null {
  if (value == null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new HTTPException(400, { message: "locationIds must be an array of hotspot IDs" });
  }
  if (value.length === 0) {
    throw new HTTPException(400, { message: "locationIds must contain at least one hotspot ID" });
  }
  if (value.length > LOCATION_IDS_MAX) {
    throw new HTTPException(400, { message: `locationIds cannot contain more than ${LOCATION_IDS_MAX} hotspots` });
  }

  const locationIds = value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new HTTPException(400, { message: "locationIds must be an array of hotspot IDs" });
    }
    const locationId = item.trim().toUpperCase();
    if (!isLocationId(locationId)) {
      throw new HTTPException(400, { message: "locationIds must contain hotspot IDs like L12345" });
    }
    return locationId;
  });

  return [...new Set(locationIds)];
}
