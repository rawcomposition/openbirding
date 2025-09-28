import db from "./sqlite.js";
import { sql } from "kysely";
import type { Hotspot as HotspotType } from "./types.js";
import { REGION_SYNC_INTERVAL } from "./config.js";

type EBirdHotspot = {
  locId: string;
  locName: string;
  lat: number;
  lng: number;
  numSpeciesAllTime?: number;
  countryCode: string;
  subnational1Code: string;
  subnational2Code: string;
};

type ProcessedHotspot = {
  locationId: string;
  name: string;
  lat: number;
  lng: number;
  total: number;
  countryCode: string;
  subnational1Code: string;
  subnational2Code: string;
};

export const getHotspotsForRegion = async (region: string): Promise<ProcessedHotspot[]> => {
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
      countryCode: hotspot.countryCode,
      subnational1Code: hotspot.subnational1Code,
      subnational2Code: hotspot.subnational2Code,
    }))
    .filter((hotspot: ProcessedHotspot) => !hotspot.name.toLowerCase().startsWith("stakeout"));
};

const updateHotspot = (dbHotspot: HotspotType, ebird: ProcessedHotspot) => {
  const { name, lat, lng, total, subnational2Code } = ebird;
  const hasChanged =
    name !== dbHotspot.name ||
    lat !== dbHotspot.lat ||
    lng !== dbHotspot.lng ||
    total !== dbHotspot.species ||
    subnational2Code !== dbHotspot.county;

  if (!hasChanged) return null;

  return {
    id: dbHotspot.id,
    name,
    species: total,
    lat,
    lng,
    county: subnational2Code,
  };
};

const insertHotspot = (ebird: ProcessedHotspot, region: string) => {
  const { lat, lng, locationId, name, total, subnational1Code, subnational2Code } = ebird;

  if (!lat || !lng || !locationId || !name) return null;

  const hasValidStateCode = (subnational1Code?.split("-")?.filter(Boolean)?.length || 0) > 1;
  const state = hasValidStateCode ? subnational1Code : null;
  const county = subnational2Code;
  const country = subnational1Code?.split("-")?.[0] || "";

  return {
    id: locationId,
    name,
    region: county || state || country,
    country,
    state,
    county,
    species: total,
    lat,
    lng,
    open: null,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

export const syncPack = async (packId?: number) => {
  if (!packId) {
    throw new Error("Pack ID parameter is required");
  }

  const pack = await db.selectFrom("packs").selectAll().where("id", "=", packId).executeTakeFirst();

  if (!pack) {
    throw new Error(`Pack with ID ${packId} not found`);
  }

  console.log(`Starting sync for pack ${packId} (${pack.region})`);

  const [hotspots, dbHotspots] = await Promise.all([
    getHotspotsForRegion(pack.region),
    db.selectFrom("hotspots").selectAll().where("region", "=", pack.region).execute(),
  ]);

  console.log(`Found ${hotspots.length} hotspots from eBird, ${dbHotspots.length} in database`);

  const ebirdIds = new Set(hotspots.map(({ locationId }) => locationId));
  const existingIds = new Set(dbHotspots.map((h) => h.id));

  let insertCount = 0;
  let updateCount = 0;
  let deleteCount = 0;

  const batchSize = 1000;
  const totalBatches = Math.ceil(hotspots.length / batchSize);

  for (let i = 0; i < hotspots.length; i += batchSize) {
    const batch = hotspots.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} hotspots)`);

    const batchValues = batch.map((ebird) => {
      const hasValidStateCode = (ebird.subnational1Code?.split("-")?.filter(Boolean)?.length || 0) > 1;
      const state = hasValidStateCode ? ebird.subnational1Code : null;
      const county = ebird.subnational2Code;
      const country = ebird.countryCode;

      if (existingIds.has(ebird.locationId)) {
        updateCount++;
      } else {
        insertCount++;
      }

      return {
        id: ebird.locationId,
        name: ebird.name,
        region: county || state || country,
        country,
        state,
        county,
        species: ebird.total,
        lat: ebird.lat,
        lng: ebird.lng,
        open: null,
        notes: null,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
    });

    if (batchValues.length > 0) {
      await db
        .insertInto("hotspots")
        .values(batchValues)
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            name: sql`excluded.name`,
            species: sql`excluded.species`,
            lat: sql`excluded.lat`,
            lng: sql`excluded.lng`,
            region: sql`excluded.region`,
            country: sql`excluded.country`,
            state: sql`excluded.state`,
            county: sql`excluded.county`,
          })
        )
        .execute();
    }
  }

  console.log(`Processing deletions...`);
  const deletions = dbHotspots.filter((h) => !ebirdIds.has(h.id));

  if (deletions.length > 0) {
    const deleteIds = deletions.map((h) => h.id);
    await db.deleteFrom("hotspots").where("id", "in", deleteIds).execute();
    deleteCount = deletions.length;
  }

  const currentTimestamp = new Date().toISOString();

  await db
    .updateTable("packs")
    .set({
      hotspots: hotspots.length,
      lastSynced: currentTimestamp,
    })
    .where("id", "=", packId)
    .execute();

  console.log(
    `Sync complete for pack ${packId} (${pack.region}): ${insertCount} inserted, ${updateCount} updated, ${deleteCount} deleted`
  );

  return {
    success: true,
    message: `Synced pack ${packId} (${pack.region}). Inserted ${insertCount}, updated ${updateCount}, deleted ${deleteCount} hotspots.`,
    packId,
    region: pack.region,
    insertCount,
    updateCount,
    deleteCount,
  };
};

export const getPacksNeedingSync = async (limit: number = 1000) => {
  const currentTime = new Date();
  const syncIntervalMs = REGION_SYNC_INTERVAL;

  const packsNeedingSync = await db
    .selectFrom("packs")
    .selectAll()
    .where((eb) =>
      eb.or([
        eb("lastSynced", "is", null),
        eb("lastSynced", "<=", new Date(currentTime.getTime() - syncIntervalMs).toISOString()),
      ])
    )
    .limit(limit)
    .execute();

  return packsNeedingSync;
};
