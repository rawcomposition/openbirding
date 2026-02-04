import { kCenterClustering, desiredClusters } from "./spatial.js";
import { TARGETS_DB_FILENAME } from "./config.js";

// Derive version from targets database filename (e.g., "targets-dec-2025.db" -> "dec-2025")
export const PACK_VERSION = TARGETS_DB_FILENAME.replace(/^targets-/, "").replace(/\.db$/, "");

// Types for eBird API hotspot data
export type EBirdHotspot = {
  locationId: string;
  name: string;
  lat: number;
  lng: number;
  total: number;
  countryCode: string;
  subnational1Code: string;
  subnational2Code: string;
};

// Types for pack output
// Compact cluster format: [lat, lng]
export type PackCluster = [number, number];

export type PackHotspot = {
  id: string;
  name: string;
  species: number;
  lat: number;
  lng: number;
  country: string;
  state: string | null;
  county: string | null;
  countryName: string;
  stateName: string | null;
  countyName: string | null;
};

export type PackTarget = {
  id: string;
  samples: (number | null)[];
  species: (string | number)[][];
};

export type PackData = {
  v: string;
  hotspots: PackHotspot[];
  targets: PackTarget[];
};

export type PackMetadata = {
  v: string;
  id: string;
  region: string;
  name: string;
  hotspots: number;
  clusters: PackCluster[];
  size: number;
  updatedAt: string;
};

export type PacksIndex = {
  packs: PackMetadata[];
};

/**
 * Generate clusters for a set of hotspots using k-center clustering
 * Returns compact format: [[lat, lng], ...]
 */
export function generateClusters(
  hotspots: Array<{ lat: number; lng: number }>,
  centerLat?: number | null,
  centerLng?: number | null
): PackCluster[] {
  if (hotspots.length === 0) {
    return [];
  }

  const k = desiredClusters(hotspots.length);
  const centers = kCenterClustering(hotspots, k, centerLat, centerLng);

  return centers.map((center) => [
    Math.round(center.lat * 1000) / 1000,
    Math.round(center.lng * 1000) / 1000,
  ] as PackCluster);
}

/**
 * Get region name from regions map, with fallback
 */
export function getRegionName(
  regionCode: string | null | undefined,
  regionNames: Map<string, string>
): string | null {
  if (!regionCode) return null;
  return regionNames.get(regionCode) ?? null;
}

/**
 * Build month observations data structure from raw rows
 */
export function buildMonthObsMap(
  rows: Array<{
    location_id: string;
    month: number;
    species_id: number;
    obs: number;
    samples: number;
  }>
): Map<
  string,
  {
    samples: (number | null)[];
    speciesObs: Map<number, number[]>;
  }
> {
  const obsByLocation = new Map<
    string,
    {
      samples: (number | null)[];
      speciesObs: Map<number, number[]>;
    }
  >();

  for (const row of rows) {
    let locationData = obsByLocation.get(row.location_id);
    if (!locationData) {
      locationData = {
        samples: Array(12).fill(null),
        speciesObs: new Map(),
      };
      obsByLocation.set(row.location_id, locationData);
    }

    const monthIdx = row.month - 1;

    // Set samples for this month (same for all species at this location/month)
    if (locationData.samples[monthIdx] === null) {
      locationData.samples[monthIdx] = row.samples;
    }

    // Set species observations
    let speciesData = locationData.speciesObs.get(row.species_id);
    if (!speciesData) {
      speciesData = Array(12).fill(0);
      locationData.speciesObs.set(row.species_id, speciesData);
    }
    speciesData[monthIdx] = row.obs;
  }

  return obsByLocation;
}

/**
 * Build pack hotspots array from eBird hotspots and observation data
 */
export function buildPackHotspots(
  ebirdHotspots: EBirdHotspot[],
  obsByLocation: Map<string, { speciesObs: Map<number, number[]> }>,
  regionNames: Map<string, string>
): PackHotspot[] {
  return ebirdHotspots.map((h) => {
    const locationData = obsByLocation.get(h.locationId);
    const speciesCount = locationData?.speciesObs.size ?? 0;

    return {
      id: h.locationId,
      name: h.name,
      species: speciesCount,
      lat: h.lat,
      lng: h.lng,
      country: h.countryCode,
      state: h.subnational1Code || null,
      county: h.subnational2Code || null,
      countryName: regionNames.get(h.countryCode) ?? h.countryCode,
      stateName: h.subnational1Code ? (regionNames.get(h.subnational1Code) ?? null) : null,
      countyName: h.subnational2Code ? (regionNames.get(h.subnational2Code) ?? null) : null,
    };
  });
}

/**
 * Build pack targets array from observation data
 */
export function buildPackTargets(
  obsByLocation: Map<
    string,
    {
      samples: (number | null)[];
      speciesObs: Map<number, number[]>;
    }
  >,
  speciesById: Map<number, string>
): PackTarget[] {
  const packTargets: PackTarget[] = [];

  for (const [locationId, locationData] of obsByLocation) {
    const speciesArray: (string | number)[][] = [];

    for (const [speciesId, obsArray] of locationData.speciesObs) {
      const speciesCode = speciesById.get(speciesId);
      if (speciesCode) {
        speciesArray.push([speciesCode, ...obsArray]);
      }
    }

    packTargets.push({
      id: locationId,
      samples: locationData.samples,
      species: speciesArray,
    });
  }

  return packTargets;
}
