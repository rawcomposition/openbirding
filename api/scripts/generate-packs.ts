import "dotenv/config";
import Database from "better-sqlite3";
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { TARGETS_DB_FILENAME } from "../lib/config.js";

const PACK_VERSION = "dec-2025";
const OUTPUT_DIR = "./packs";

// Initialize databases
const targetsDb = new Database(`${process.env.SQLITE_DIR}${TARGETS_DB_FILENAME}`);
const mainDb = new Database(`${process.env.SQLITE_DIR}${process.env.SQLITE_FILENAME}`);

targetsDb.pragma("journal_mode = WAL");
targetsDb.pragma("cache_size = -64000"); // 64MB cache

type HotspotRow = {
  id: string;
  name: string;
  country_code: string;
  subnational1_code: string;
  subnational2_code: string | null;
  lat: number;
  lng: number;
};

type MonthObsRow = {
  location_id: string;
  month: number;
  species_id: number;
  obs: number;
  samples: number;
};

type SpeciesRow = {
  id: number;
  code: string;
};

type RegionRow = {
  id: string;
  name: string;
};

type PackHotspot = {
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

type PackTarget = {
  id: string;
  samples: (number | null)[];
  species: (string | number)[][];
};

type PackData = {
  v: string;
  hotspots: PackHotspot[];
  targets: PackTarget[];
};

// Prepare statements for better performance
const getHotspotsStmt = targetsDb.prepare<[string]>(`
  SELECT id, name, country_code, subnational1_code, subnational2_code, lat, lng
  FROM hotspots
  WHERE region_code LIKE ? || '%'
`);

const getMonthObsForHotspotsStmt = targetsDb.prepare<[string]>(`
  SELECT location_id, month, species_id, obs, samples
  FROM month_obs
  WHERE location_id IN (SELECT id FROM hotspots WHERE region_code LIKE ? || '%')
`);

const getAllSpeciesStmt = targetsDb.prepare(`
  SELECT id, code FROM species
`);

const getRegionsStmt = mainDb.prepare<[string]>(`
  SELECT id, name FROM regions WHERE id IN (
    SELECT value FROM json_each(?)
  )
`);

const getPacksStmt = mainDb.prepare(`
  SELECT id, region FROM packs ORDER BY id ASC
`);

type PackRow = {
  id: number;
  region: string;
};

async function generatePack(region: string): Promise<void> {
  console.log(`\nGenerating pack for region: ${region}`);
  const startTime = performance.now();

  // Get all hotspots for this region
  const hotspots = getHotspotsStmt.all(region) as HotspotRow[];
  console.log(`  Found ${hotspots.length} hotspots`);

  if (hotspots.length === 0) {
    console.log(`  Skipping - no hotspots`);
    return;
  }

  // Get all month_obs for hotspots in this region
  const monthObs = getMonthObsForHotspotsStmt.all(region) as MonthObsRow[];
  console.log(`  Found ${monthObs.length} month_obs rows`);

  // Build species lookup map
  const allSpecies = getAllSpeciesStmt.all() as SpeciesRow[];
  const speciesById = new Map<number, string>(allSpecies.map((s) => [s.id, s.code]));

  // Collect unique region codes for name lookup
  const regionCodes = new Set<string>();
  for (const h of hotspots) {
    regionCodes.add(h.country_code);
    if (h.subnational1_code) regionCodes.add(h.subnational1_code);
    if (h.subnational2_code) regionCodes.add(h.subnational2_code);
  }

  // Get region names from main database
  const regionCodesJson = JSON.stringify([...regionCodes]);
  const regions = getRegionsStmt.all(regionCodesJson) as RegionRow[];
  const regionNames = new Map<string, string>(regions.map((r) => [r.id, r.name]));

  // Build month_obs data structure grouped by location
  const obsByLocation = new Map<
    string,
    {
      samples: (number | null)[];
      speciesObs: Map<number, number[]>;
    }
  >();

  for (const row of monthObs) {
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

  // Build pack hotspots
  const packHotspots: PackHotspot[] = hotspots.map((h) => {
    const locationData = obsByLocation.get(h.id);
    const speciesCount = locationData?.speciesObs.size ?? 0;

    return {
      id: h.id,
      name: h.name,
      species: speciesCount,
      lat: h.lat,
      lng: h.lng,
      country: h.country_code,
      state: h.subnational1_code || null,
      county: h.subnational2_code || null,
      countryName: regionNames.get(h.country_code) ?? h.country_code,
      stateName: h.subnational1_code ? (regionNames.get(h.subnational1_code) ?? null) : null,
      countyName: h.subnational2_code ? (regionNames.get(h.subnational2_code) ?? null) : null,
    };
  });

  // Build pack targets
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

  // Create pack data
  const packData: PackData = {
    v: PACK_VERSION,
    hotspots: packHotspots,
    targets: packTargets,
  };

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write gzipped JSON
  const outputPath = `${OUTPUT_DIR}/${region}.json.gz`;
  const jsonString = JSON.stringify(packData);

  await pipeline(Readable.from([jsonString]), createGzip(), createWriteStream(outputPath));

  const elapsed = Math.round(performance.now() - startTime);
  const sizeKB = Math.round(jsonString.length / 1024);
  console.log(`  Generated ${outputPath} (${sizeKB} KB uncompressed) in ${elapsed}ms`);
}

async function main() {
  const startTime = performance.now();

  try {
    const regionArg = process.argv[2];
    const packs = getPacksStmt.all() as PackRow[];

    if (regionArg) {
      // Process single region
      const pack = packs.find((p) => p.region === regionArg);
      if (!pack) {
        console.error(`Pack for region "${regionArg}" not found.`);
        console.error(`Available regions: ${packs.map((p) => p.region).join(", ")}`);
        process.exit(1);
      }
      await generatePack(regionArg);
    } else {
      // Process all packs
      console.log(`Processing ${packs.length} packs...`);

      for (const pack of packs) {
        try {
          await generatePack(pack.region);
        } catch (error) {
          console.error(`Error processing pack ${pack.region}:`, error instanceof Error ? error.message : error);
        }
      }
    }

    const totalElapsed = Math.round(performance.now() - startTime);
    console.log(`\nCompleted in ${totalElapsed}ms`);
  } catch (error) {
    console.error("Error during pack generation:", error);
    process.exit(1);
  } finally {
    targetsDb.close();
    mainDb.close();
  }
}

main();
