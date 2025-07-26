import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withCors } from "../lib/cors";
import connect from "../lib/db";
import Hotspot from "../models/Hotspot";
import Settings from "../models/Settings";
import Log from "../models/Log";
import { syncRegions } from "../data/sync-regions";
import { Hotspot as HotspotType } from "../lib/types";

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
  console.log(`Fetching eBird hotspots for ${region}`);

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

  let location = null;
  if (lat && lng) {
    location = {
      type: "Point",
      coordinates: [lng, lat],
    };
  }

  console.log(`Updating hotspot ${dbHotspot._id}`);
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
  console.log(`Marking hotspot ${id} for deletion`);
  return {
    deleteOne: {
      filter: { _id: id },
    },
  };
};

const insertHotspot = (ebird: ProcessedHotspot) => {
  const { lat, lng, locationId, name, total, subnational1Code, subnational2Code } = ebird;

  if (!lat || !lng || !locationId || !name) return null;

  console.log(`Inserting hotspot ${locationId}`);

  const hasValidStateCode = (subnational1Code?.split("-")?.filter(Boolean)?.length || 0) > 1;
  const state = hasValidStateCode ? subnational1Code : null;
  const county = subnational2Code;

  let location = null;
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

async function handler(request: VercelRequest, response: VercelResponse) {
  const { key, region } = request.query;
  const authHeader = request.headers.authorization;

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
    return response.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  try {
    await connect();

    const settings = await Settings.findOne({}, "lastSyncRegion");
    const lastSyncRegion = settings?.lastSyncRegion;

    const lastSyncRegionIndex = lastSyncRegion ? syncRegions.indexOf(lastSyncRegion) : -1;
    const nextRegion = (region as string) || syncRegions[lastSyncRegionIndex + 1] || syncRegions[0];

    console.log(`Syncing ${nextRegion}`);

    const [hotspots, dbHotspots] = await Promise.all([
      getHotspotsForRegion(nextRegion),
      Hotspot.find({ $or: [{ state: nextRegion }, { country: nextRegion }] }).select(
        "locationId name lat lng species county"
      ),
    ]);

    const dbHotspotIds: string[] = dbHotspots.map((hotspot) => hotspot._id).filter(Boolean) as string[];
    const ebirdIds = hotspots.map(({ locationId }) => locationId);

    const bulkWrites: any[] = [];
    let insertCount = 0;

    hotspots.forEach((ebird: ProcessedHotspot) => {
      const index = dbHotspotIds.indexOf(ebird.locationId);
      if (index > -1) {
        const dbHotspot = dbHotspots[index];
        const updateOp = updateHotspot(dbHotspot, ebird);
        if (updateOp) bulkWrites.push(updateOp);
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
    });

    if (bulkWrites.length > 0) {
      await Hotspot.bulkWrite(bulkWrites);
    }

    await Promise.all([
      Log.create({
        user: "BirdBot",
        type: "sync",
        message: `synced ${nextRegion}. Found ${insertCount || 0} new ${insertCount === 1 ? "hotspot" : "hotspots"}.`,
      }),
      Settings.updateOne({}, { lastSyncRegion: nextRegion }, { upsert: true }),
    ]);

    response.status(200).json({
      success: true,
      message: `Successfully synced ${nextRegion}. Found ${insertCount || 0} new ${
        insertCount === 1 ? "hotspot" : "hotspots"
      }.`,
    });
  } catch (error: any) {
    console.error("Sync error:", error);
    response.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export default withCors(handler, {
  methods: ["POST", "OPTIONS"],
});
