import "dotenv/config";
import Database from "better-sqlite3";
import { createWriteStream, mkdirSync, existsSync, statSync } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { TARGETS_DB_FILENAME } from "../lib/config.js";
import { getHotspotsForRegion } from "../lib/ebird.js";
import {
  PACK_VERSION,
  generateClusters,
  buildMonthObsMap,
  buildPackHotspots,
  buildPackTargets,
  type EBirdHotspot,
  type PackData,
  type PackMetadata,
  type PacksIndex,
} from "../lib/packs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type PacksFileEntry = {
  id: string;
  region: string;
  center_lat: number | null;
  center_lng: number | null;
  name: string;
};

const packsModule = await import(join(__dirname, "../../packs.js"));
const packs = packsModule.packs as PacksFileEntry[];

const OUTPUT_DIR = "../../packs";
const EBIRD_API_DELAY = 1000; // 1 second delay between eBird API calls

// Initialize databases
const targetsDb = new Database(`${process.env.SQLITE_DIR}${TARGETS_DB_FILENAME}`);
const mainDb = new Database(`${process.env.SQLITE_DIR}${process.env.SQLITE_FILENAME}`);

targetsDb.pragma("journal_mode = WAL");
targetsDb.pragma("cache_size = -64000"); // 64MB cache

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


// Prepare statements for better performance
const getMonthObsStmt = targetsDb.prepare<[string]>(`
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generatePack(
  pack: PacksFileEntry,
  speciesById: Map<number, string>,
  isFirstPack: boolean
): Promise<PackMetadata | null> {
  const { id, region, center_lat, center_lng, name } = pack;
  console.log(`\nGenerating pack for region: ${region}`);
  const startTime = performance.now();

  // Add delay between eBird API calls (except for the first pack)
  if (!isFirstPack) {
    await delay(EBIRD_API_DELAY);
  }

  // Fetch hotspots from eBird API
  let ebirdHotspots: EBirdHotspot[];
  try {
    ebirdHotspots = await getHotspotsForRegion(region);
    console.log(`  Fetched ${ebirdHotspots.length} hotspots from eBird`);
  } catch (error) {
    console.error(`  Error fetching hotspots from eBird: ${error instanceof Error ? error.message : error}`);
    return null;
  }

  if (ebirdHotspots.length === 0) {
    console.log(`  Skipping - no hotspots`);
    return null;
  }

  // Get all month_obs for hotspots in this region from local database
  const monthObs = getMonthObsStmt.all(region) as MonthObsRow[];
  console.log(`  Found ${monthObs.length} month_obs rows in database`);

  // Collect unique region codes for name lookup
  const regionCodes = new Set<string>();
  for (const h of ebirdHotspots) {
    regionCodes.add(h.countryCode);
    if (h.subnational1Code) regionCodes.add(h.subnational1Code);
    if (h.subnational2Code) regionCodes.add(h.subnational2Code);
  }

  // Get region names from main database
  const regionCodesJson = JSON.stringify([...regionCodes]);
  const regions = getRegionsStmt.all(regionCodesJson) as RegionRow[];
  const regionNames = new Map<string, string>(regions.map((r) => [r.id, r.name]));

  // Build month_obs data structure grouped by location
  const obsByLocation = buildMonthObsMap(monthObs);

  // Build pack hotspots
  const packHotspots = buildPackHotspots(ebirdHotspots, obsByLocation, regionNames);

  // Build pack targets
  const packTargets = buildPackTargets(obsByLocation, speciesById);

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

  // Get file size
  const fileSize = statSync(outputPath).size;

  // Generate clusters
  const clusters = generateClusters(ebirdHotspots, center_lat, center_lng);

  const elapsed = Math.round(performance.now() - startTime);
  const sizeKB = Math.round(jsonString.length / 1024);
  console.log(`  Generated ${outputPath} (${sizeKB} KB uncompressed, ${Math.round(fileSize / 1024)} KB compressed) in ${elapsed}ms`);

  return {
    v: PACK_VERSION,
    id,
    region,
    name,
    hotspots: ebirdHotspots.length,
    clusters,
    size: fileSize,
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  const startTime = performance.now();

  try {
    const regionArg = process.argv[2];
    const packsList: PacksFileEntry[] = packs.map((p) => ({
      id: p.id,
      region: p.region,
      center_lat: p.center_lat,
      center_lng: p.center_lng,
      name: p.name,
    }));

    // Build species lookup map once
    const allSpecies = getAllSpeciesStmt.all() as SpeciesRow[];
    const speciesById = new Map<number, string>(allSpecies.map((s) => [s.id, s.code]));
    console.log(`Loaded ${speciesById.size} species`);

    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const packMetadataList: PackMetadata[] = [];

    if (regionArg) {
      // Process single region
      const pack = packsList.find((p) => p.region === regionArg);
      if (!pack) {
        console.error(`Pack for region "${regionArg}" not found.`);
        console.error(`Available regions: ${packsList.map((p) => p.region).join(", ")}`);
        process.exit(1);
      }

      const metadata = await generatePack(pack, speciesById, true);
      if (metadata) {
        packMetadataList.push(metadata);
      }
    } else {
      // Process all packs
      console.log(`Processing ${packsList.length} packs...`);

      for (let i = 0; i < packsList.length; i++) {
        const pack = packsList[i];
        try {
          const metadata = await generatePack(pack, speciesById, i === 0);
          if (metadata) {
            packMetadataList.push(metadata);
          }
        } catch (error) {
          console.error(`Error processing pack ${pack.region}:`, error instanceof Error ? error.message : error);
        }
      }
    }

    // Generate packs.json.gz index file
    if (packMetadataList.length > 0) {
      const packsIndex: PacksIndex = {
        packs: packMetadataList,
      };

      const packsIndexPath = `${OUTPUT_DIR}/packs.json.gz`;
      const packsIndexJson = JSON.stringify(packsIndex);

      await pipeline(Readable.from([packsIndexJson]), createGzip(), createWriteStream(packsIndexPath));

      console.log(`\nGenerated ${packsIndexPath} with ${packMetadataList.length} packs`);
    }

    const totalElapsed = Math.round(performance.now() - startTime);
    console.log(`\nCompleted in ${Math.round(totalElapsed / 1000)}s`);
  } catch (error) {
    console.error("Error during pack generation:", error);
    process.exit(1);
  } finally {
    targetsDb.close();
    mainDb.close();
  }
}

main();
