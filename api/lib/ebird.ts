import connect from "./db";
import Hotspot from "../models/Hotspot";
import Settings from "../models/Settings";
import Log from "../models/Log";
import { syncRegions } from "../data/sync-regions";
import { Hotspot as HotspotType } from "./types";
import { REGION_SYNC_INTERVAL } from "./config";

type EBirdHotspot = {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  numSpeciesAllTime?: number;
  subnational1Code: string;
  subnational2Code: string;
};

type ProcessedHotspot = {
  locationId: string;
  name: string;
  lat: number;
  lng: number;
  total: number;
  subnational1Code: string;
  subnational2Code: string;
};

const getHotspotsForRegion = async (region: string): Promise<ProcessedHotspot[]> => {
  const apiKey = process.env.EBIRD_API_KEY;
  if (!apiKey) {
    throw new Error("EBIRD_API_KEY environment variable is required");
  }

  const response = await fetch(`https://api.ebird.org/v2/ref/hotspot/${region}?fmt=json&key=${apiKey}`);

  if (!response.ok) {
    throw new Error(`eBird API request failed: ${response.statusText}`);
  }

  const json = (await response.json()) as EBirdHotspot[];

  if ("errors" in json) {
    throw new Error("Error fetching eBird hotspots");
  }

  return json
    .map((hotspot: EBirdHotspot) => ({
      locationId: hotspot.locId,
      name: hotspot.locName.trim(),
      lat: hotspot.lat,
      lng: hotspot.lng,
      total: hotspot.numSpeciesAllTime || 0,
      subnational1Code: hotspot.subnational1Code,
      subnational2Code: hotspot.subnational2Code,
    }))
    .filter((hotspot: ProcessedHotspot) => !hotspot.name.toLowerCase().startsWith("stakeout"));
};

const updateHotspot = (dbHotspot: HotspotType, ebird: ProcessedHotspot) => {
  const { name, lat, lng, total, subnational2Code } = ebird;
  const hasChanged =
    name !== dbHotspot.name ||
    lat !== dbHotspot.location.coordinates[1] ||
    lng !== dbHotspot.location.coordinates[0] ||
    total !== dbHotspot.species ||
    subnational2Code !== dbHotspot.county;

  if (!hasChanged) return null;

  let location: { type: "Point"; coordinates: [number, number] } | null = null;
  if (lat && lng) {
    location = {
      type: "Point",
      coordinates: [lng, lat],
    };
  }

  return {
    updateOne: {
      filter: { _id: dbHotspot._id },
      update: {
        name,
        species: total,
        location,
        county: subnational2Code,
      },
    },
  };
};

const deleteHotspot = (id: string) => {
  return {
    deleteOne: {
      filter: { _id: id },
    },
  };
};

const insertHotspot = (ebird: ProcessedHotspot) => {
  const { lat, lng, locationId, name, total, subnational1Code, subnational2Code } = ebird;

  if (!lat || !lng || !locationId || !name) return null;

  const hasValidStateCode = (subnational1Code?.split("-")?.filter(Boolean)?.length || 0) > 1;
  const state = hasValidStateCode ? subnational1Code : null;
  const county = subnational2Code;

  let location: { type: "Point"; coordinates: [number, number] } | null = null;
  if (lat && lng) {
    location = {
      type: "Point",
      coordinates: [lng, lat],
    };
  }

  return {
    insertOne: {
      document: {
        _id: locationId,
        name,
        country: subnational1Code?.split("-")?.[0] || "",
        state,
        county,
        location,
        species: total,
      },
    },
  };
};

export const syncRegion = async (region?: string) => {
  await connect();

  if (!region) {
    throw new Error("Region parameter is required");
  }

  const [hotspots, dbHotspots] = await Promise.all([
    getHotspotsForRegion(region),
    Hotspot.find({ $or: [{ state: region }, { country: region }] }).select("locationId name lat lng species county"),
  ]);

  const dbHotspotIds: string[] = dbHotspots.map((hotspot) => hotspot._id).filter(Boolean) as string[];
  const ebirdIds = hotspots.map(({ locationId }) => locationId);

  const bulkWrites: any[] = [];
  let insertCount = 0;
  let updateCount = 0;
  let deleteCount = 0;

  hotspots.forEach((ebird: ProcessedHotspot) => {
    const index = dbHotspotIds.indexOf(ebird.locationId);
    if (index > -1) {
      const dbHotspot = dbHotspots[index];
      const updateOp = updateHotspot(dbHotspot, ebird);
      if (updateOp) {
        bulkWrites.push(updateOp);
        updateCount++;
      }
      return;
    }
    const insertOp = insertHotspot(ebird);
    if (insertOp) {
      bulkWrites.push(insertOp);
      insertCount++;
    }
  });

  dbHotspots.forEach((dbHotspot: HotspotType) => {
    if (ebirdIds.includes(dbHotspot._id)) return;
    bulkWrites.push(deleteHotspot(dbHotspot._id));
    deleteCount++;
  });

  if (bulkWrites.length > 0) {
    await Hotspot.bulkWrite(bulkWrites);
  }

  const currentTimestamp = Date.now();

  await Promise.all([
    Log.create({
      user: "BirdBot",
      type: "sync",
      message: `synced ${region}. Found ${insertCount || 0} new ${insertCount === 1 ? "hotspot" : "hotspots"}.`,
    }),
    Settings.updateOne({}, { [`regionSyncTimestamps.${region}`]: currentTimestamp }, { upsert: true }),
  ]);

  console.log(`Sync complete for ${region}: ${insertCount} inserted, ${updateCount} updated, ${deleteCount} deleted`);

  return {
    success: true,
    message: `Synced ${region}. Found ${insertCount || 0} new ${insertCount === 1 ? "hotspot" : "hotspots"}.`,
    region,
    insertCount,
    updateCount,
    deleteCount,
  };
};

export const getRegionsNeedingSync = async () => {
  await connect();

  const settings = await Settings.findOne({}, "regionSyncTimestamps");
  const timestamps = settings?.regionSyncTimestamps || {};
  const currentTime = Date.now();

  return syncRegions.filter((region) => {
    const lastSyncTime = timestamps[region];
    if (!lastSyncTime) return true;

    const timeSinceLastSync = currentTime - lastSyncTime;
    return timeSinceLastSync >= REGION_SYNC_INTERVAL;
  });
};
