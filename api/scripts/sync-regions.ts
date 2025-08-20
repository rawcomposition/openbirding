import "dotenv/config";
import connect from "../lib/db.js";
import Region from "../models/Region.js";

type EBirdRegion = {
  code: string;
  name: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchRegions = async (regionType: string, parentRegionCode: string): Promise<EBirdRegion[]> => {
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

  return (await response.json()) as EBirdRegion[];
};

const saveRegions = async (
  regions: EBirdRegion[],
  isCountry = false
): Promise<{ inserted: number; updated: number }> => {
  if (regions.length === 0) return { inserted: 0, updated: 0 };

  const bulkOps = regions.map((region) => ({
    updateOne: {
      filter: { _id: region.code },
      update: { $set: { name: region.name, ...(isCountry && { isCountry: true }) } },
      upsert: true,
    },
  }));

  const result = await Region.bulkWrite(bulkOps);
  const inserted = result.upsertedCount || 0;
  const updated = result.modifiedCount || 0;

  const type = isCountry ? "countries" : "regions";
  console.log(`Synced ${regions.length} ${type}: ${inserted} inserted, ${updated} updated`);

  return { inserted, updated };
};

const main = async () => {
  try {
    console.log("Starting region sync...");
    await connect();
    console.log("Connected to database");

    const countries = await fetchRegions("country", "world");
    console.log(`Found ${countries.length} countries`);

    let totalInserted = 0;
    let totalUpdated = 0;

    const countryResult = await saveRegions(countries, true);
    totalInserted += countryResult.inserted;
    totalUpdated += countryResult.updated;

    for (const country of countries) {
      console.log(`\nProcessing country: ${country.code}`);

      const [states, counties] = await Promise.all([
        fetchRegions("subnational1", country.code),
        fetchRegions("subnational2", country.code),
      ]);

      console.log(`Found ${states.length} states and ${counties.length} counties for ${country.code}`);

      const allRegions = [...states, ...counties];
      const result = await saveRegions(allRegions);
      totalInserted += result.inserted;
      totalUpdated += result.updated;

      if (country !== countries[countries.length - 1]) {
        console.log("Waiting 5 seconds before next country...");
        await delay(5000);
      }
    }

    console.log("\nRegion sync completed!");
    console.log(`Total regions inserted: ${totalInserted}`);
    console.log(`Total regions updated: ${totalUpdated}`);
    console.log(`Total regions processed: ${totalInserted + totalUpdated}`);
  } catch (error) {
    console.error("Error during region sync:", error);
    process.exit(1);
  }
};

main();
