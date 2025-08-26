import db from "../lib/sqlite.js";

const parseRegion = (region: string) => {
  const parts = region.split("-");

  if (parts.length === 0) {
    return { country: null, state: null, county: null };
  }

  const country = parts[0] || null;
  const state = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : null;
  const county = parts.length >= 3 ? `${parts[0]}-${parts[1]}-${parts[2]}` : null;

  return { country, state, county };
};

async function updateHotspotRegions() {
  try {
    const totalHotspots = await db.selectFrom("hotspots").select(db.fn.count("id").as("count")).executeTakeFirst();

    const count = Number(totalHotspots?.count || 0);
    console.log(`Found ${count} hotspots in SQLite to update`);

    if (count === 0) {
      console.log("No hotspots found in SQLite to update");
      return;
    }

    const batchSize = 1000;
    let updatedCount = 0;
    let skip = 0;

    while (skip < count) {
      const hotspots = await db.selectFrom("hotspots").select(["id", "region"]).limit(batchSize).offset(skip).execute();

      if (hotspots.length === 0) break;

      const updatePromises = hotspots.map(async (hotspot) => {
        const { country, state, county } = parseRegion(hotspot.region);

        return db.updateTable("hotspots").set({ country, state, county }).where("id", "=", hotspot.id).execute();
      });

      await Promise.all(updatePromises);

      updatedCount += hotspots.length;
      skip += batchSize;

      console.log(`Updated ${updatedCount}/${count} hotspots (${Math.round((updatedCount / count) * 100)}%)`);
    }

    console.log(`Successfully updated ${updatedCount} hotspots in SQLite`);
  } catch (error) {
    console.error("Error updating hotspots:", error);
    throw error;
  } finally {
    await db.destroy();
  }
}

updateHotspotRegions();
