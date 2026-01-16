import "dotenv/config";
import db from "../lib/sqlite.js";
const DELAY = 3000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchRegionInfo = async (regionCode) => {
    const apiKey = process.env.EBIRD_API_KEY;
    if (!apiKey) {
        throw new Error("EBIRD_API_KEY environment variable is required");
    }
    const url = `https://api.ebird.org/v2/ref/region/info/${regionCode}?key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`eBird API request failed: ${response.statusText}`);
    }
    return (await response.json());
};
const getPacksMissingCoordinates = async () => {
    return await db
        .selectFrom("packs")
        .select(["id", "region", "hasCustomCenter"])
        .where((eb) => eb.or([
        eb("minX", "is", null),
        eb("minY", "is", null),
        eb("maxX", "is", null),
        eb("maxY", "is", null),
        eb("centerLat", "is", null),
        eb("centerLng", "is", null),
    ]))
        .execute();
};
const updatePackCoordinates = async (packId, regionInfo, hasCustomCenter) => {
    const updateData = {
        minX: Math.round(regionInfo.bounds.minX * 1000000) / 1000000,
        minY: Math.round(regionInfo.bounds.minY * 1000000) / 1000000,
        maxX: Math.round(regionInfo.bounds.maxX * 1000000) / 1000000,
        maxY: Math.round(regionInfo.bounds.maxY * 1000000) / 1000000,
    };
    if (!hasCustomCenter) {
        updateData.centerLat = Math.round(regionInfo.latitude * 1000000) / 1000000;
        updateData.centerLng = Math.round(regionInfo.longitude * 1000000) / 1000000;
    }
    await db.updateTable("packs").set(updateData).where("id", "=", packId).execute();
};
const main = async () => {
    try {
        console.log("Starting region info sync...");
        console.log("Connected to SQLite database");
        const packsToUpdate = await getPacksMissingCoordinates();
        console.log(`Found ${packsToUpdate.length} packs missing coordinate data`);
        if (packsToUpdate.length === 0) {
            console.log("No packs need coordinate updates");
            return;
        }
        let successCount = 0;
        let errorCount = 0;
        for (const pack of packsToUpdate) {
            try {
                const regionInfo = await fetchRegionInfo(pack.region);
                await updatePackCoordinates(pack.id, regionInfo, !!pack.hasCustomCenter);
                successCount++;
                console.log(`[${successCount}/${packsToUpdate.length}] Synced region: ${pack.region}`);
                if (pack !== packsToUpdate[packsToUpdate.length - 1]) {
                    await delay(DELAY);
                }
            }
            catch (error) {
                console.error(`Error processing pack ${pack.id} (${pack.region}):`, error instanceof Error ? error.message : error);
                errorCount++;
            }
        }
        console.log("\nRegion info sync completed!");
        console.log(`Total packs processed: ${packsToUpdate.length}`);
        console.log(`Successful updates: ${successCount}`);
        console.log(`Errors: ${errorCount}`);
    }
    catch (error) {
        console.error("Error during region info sync:", error);
        process.exit(1);
    }
};
main();
