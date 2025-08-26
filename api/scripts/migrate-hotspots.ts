import connect from "../lib/db.js";
import Hotspot from "../models/Hotspot.js";
import db from "../lib/sqlite.js";

async function migrateAllHotspots() {
  try {
    await connect();

    const totalHotspots = await Hotspot.countDocuments();
    console.log(`Found ${totalHotspots} hotspots in MongoDB to migrate`);

    if (totalHotspots === 0) {
      console.log("No hotspots found in MongoDB to migrate");
      return;
    }

    const batchSize = 1000;
    let migratedCount = 0;
    let skip = 0;

    while (skip < totalHotspots) {
      const hotspots = await Hotspot.find({}).skip(skip).limit(batchSize).lean();

      if (hotspots.length === 0) break;

      const insertData = hotspots.map((hotspot) => ({
        id: hotspot._id,
        name: hotspot.name,
        region: hotspot.region,
        country: hotspot.country || null,
        state: hotspot.state || null,
        county: hotspot.county || null,
        species: hotspot.species || 0,
        lat: hotspot.location.coordinates[1],
        lng: hotspot.location.coordinates[0],
        open: hotspot.open === true ? 1 : hotspot.open === false ? 0 : null,
        notes: hotspot.notes || null,
        createdAt: hotspot.updatedAt ? hotspot.updatedAt.toISOString() : new Date().toISOString(),
        updatedAt: hotspot.updatedAt ? hotspot.updatedAt.toISOString() : new Date().toISOString(),
      }));

      await db
        .insertInto("hotspots")
        .values(insertData)
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();

      migratedCount += insertData.length;
      skip += batchSize;

      console.log(
        `Migrated ${migratedCount}/${totalHotspots} hotspots (${Math.round((migratedCount / totalHotspots) * 100)}%)`
      );
    }

    console.log(`Successfully migrated ${migratedCount} hotspots to SQLite`);
  } catch (error) {
    console.error("Error migrating hotspots:", error);
    throw error;
  } finally {
    await db.destroy();
  }
}

migrateAllHotspots();
