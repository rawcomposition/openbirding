import "dotenv/config";
import db from "../lib/sqlite.js";
import { getHotspotsForRegion } from "../lib/ebird.js";
import { getDistanceKm } from "../lib/spatial.js";
import { desiredClusters, kCenterClustering } from "../lib/spatial.js";

const DELAY = 10000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const processPack = async (packId: number) => {
  const pack = await db
    .selectFrom("packs")
    .select(["id", "region", "centerLat", "centerLng"])
    .where("id", "=", packId)
    .executeTakeFirst();

  if (!pack) {
    throw new Error(`Pack with ID ${packId} not found`);
  }

  const hotspots = await getHotspotsForRegion(pack.region);

  if (hotspots.length === 0) {
    console.log(`Pack ${packId} (${pack.region}): No hotspots found`);
    return;
  }

  const k = desiredClusters(hotspots.length);
  const centers = kCenterClustering(hotspots, k, pack.centerLat, pack.centerLng);

  const counts = new Array(centers.length).fill(0);

  for (const hotspot of hotspots) {
    let minDistance = Infinity;
    let nearestCenterIndex = 0;

    for (let i = 0; i < centers.length; i++) {
      const distance = getDistanceKm(centers[i].lat, centers[i].lng, hotspot.lat, hotspot.lng);
      if (distance < minDistance) {
        minDistance = distance;
        nearestCenterIndex = i;
      }
    }

    counts[nearestCenterIndex]++;
  }

  const clusters = centers.map((center, centerIndex) => ({
    lat: Math.round(center.lat * 1000) / 1000,
    lng: Math.round(center.lng * 1000) / 1000,
    count: counts[centerIndex],
  }));

  console.log(`Pack ${packId} (${pack.region}): ${clusters.length} clusters from ${hotspots.length} hotspots`);
  console.log(clusters.map((cluster) => `${cluster.lat},${cluster.lng}`).join("\n"));
};

const main = async () => {
  try {
    const packIdArg = process.argv[2];

    if (packIdArg) {
      const packId = parseInt(packIdArg);
      if (isNaN(packId)) {
        console.error("Invalid pack ID. Must be a number.");
        process.exit(1);
      }

      await processPack(packId);
    } else {
      const packs = await db.selectFrom("packs").select(["id"]).orderBy("id", "asc").execute();

      if (packs.length === 0) {
        console.log("No packs found");
        return;
      }

      console.log(`Processing ${packs.length} packs...\n`);

      for (let i = 0; i < packs.length; i++) {
        const pack = packs[i];
        try {
          await processPack(pack.id);

          if (i < packs.length - 1) {
            console.log(`\nWaiting ${DELAY / 1000} seconds before next pack...\n`);
            await delay(DELAY);
          }
        } catch (error) {
          console.error(`Error processing pack ${pack.id}:`, error instanceof Error ? error.message : error);
        }
      }

      console.log("\nAll packs processed!");
    }
  } catch (error) {
    console.error("Error during cluster generation:", error);
    process.exit(1);
  }
};

main();
