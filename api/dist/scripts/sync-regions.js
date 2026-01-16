import "dotenv/config";
import db from "../lib/sqlite.js";
const DELAY = 5000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchRegions = async (regionType, parentRegionCode) => {
    const apiKey = process.env.EBIRD_API_KEY;
    if (!apiKey) {
        throw new Error("EBIRD_API_KEY environment variable is required");
    }
    const url = `https://api.ebird.org/v2/ref/region/list/${regionType}/${parentRegionCode}?key=${apiKey}`;
    console.log(`Fetching regions: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`eBird API request failed: ${response.statusText}`);
    }
    return (await response.json());
};
const saveRegions = async (regions) => {
    if (regions.length === 0)
        return { synced: 0 };
    for (const region of regions) {
        const level = region.code.split("-").length;
        await db
            .insertInto("regions")
            .values({
            id: region.code,
            name: region.name,
            longName: null,
            parents: "[]",
            level,
            hasChildren: 0,
        })
            .onConflict((oc) => oc.column("id").doUpdateSet({
            name: region.name,
            level,
        }))
            .execute();
    }
    console.log(`Synced ${regions.length} regions`);
    return { synced: regions.length };
};
const main = async () => {
    try {
        console.log("Starting region sync...");
        console.log("Connected to SQLite database");
        const countries = await fetchRegions("country", "world");
        console.log(`Found ${countries.length} countries`);
        let totalSynced = 0;
        const countryResult = await saveRegions(countries);
        totalSynced += countryResult.synced;
        for (const country of countries) {
            console.log(`\nProcessing country: ${country.code}`);
            const [states, counties] = await Promise.all([
                fetchRegions("subnational1", country.code),
                fetchRegions("subnational2", country.code),
            ]);
            console.log(`Found ${states.length} states and ${counties.length} counties for ${country.code}`);
            const allRegions = [...states, ...counties];
            const result = await saveRegions(allRegions);
            totalSynced += result.synced;
            if (country !== countries[countries.length - 1]) {
                console.log(`Waiting ${DELAY / 1000} seconds before next country...`);
                await delay(DELAY);
            }
        }
        console.log("\nRegion sync completed!");
        console.log(`Total regions synced: ${totalSynced}`);
    }
    catch (error) {
        console.error("Error during region sync:", error);
        process.exit(1);
    }
};
main();
