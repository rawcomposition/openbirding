import "dotenv/config";
import connect from "../lib/db.js";
import Region from "../models/Region.js";

type RegionData = {
  _id: string;
  name: string;
};

type ParentInfo = {
  name: string;
  id: string;
};

const parseRegionId = (regionId: string): string[] => {
  return regionId.split("-");
};

const getParentRegions = (regionId: string, regionMap: Map<string, string>): ParentInfo[] => {
  const parts = parseRegionId(regionId);
  if (parts.length <= 1) return [];

  const parents: ParentInfo[] = [];

  for (let i = parts.length - 1; i > 0; i--) {
    const parentId = parts.slice(0, i).join("-");
    const parentName = regionMap.get(parentId);

    if (parentName) {
      let displayName = parentName;

      if (parentId === "US") {
        displayName = "US";
      }

      parents.push({
        name: displayName,
        id: parentId,
      });
    }
  }

  return parents;
};

const generateLongName = (regionName: string, parents: ParentInfo[]): string => {
  const parentNames = parents.map((p) => p.name);
  return [regionName, ...parentNames].join(", ");
};

const hasChildren = (regionId: string, allRegionIds: string[]): boolean => {
  const childPrefix = `${regionId}-`;
  return allRegionIds.some((id) => id.startsWith(childPrefix));
};

const main = async () => {
  try {
    const regionCode = process.argv[2];

    console.log("Starting region parent generation...");
    if (regionCode) {
      console.log(`Processing only regions under: ${regionCode}`);
    }

    await connect();
    console.log("Connected to database");

    const query = regionCode ? { _id: { $regex: `^${regionCode}` } } : {};
    const regions = await Region.find(query, { _id: 1, name: 1 }).lean();
    console.log(`Found ${regions.length} regions to process`);

    const regionMap = new Map<string, string>();
    const allRegionIds = regions.map((r) => r._id);

    for (const region of regions) {
      regionMap.set(region._id, region.name);
    }

    const batchSize = 100;
    let processed = 0;
    let updated = 0;

    for (let i = 0; i < regions.length; i += batchSize) {
      const batch = regions.slice(i, i + batchSize);
      const bulkOps = [];

      for (const region of batch) {
        const parents = getParentRegions(region._id, regionMap);
        const longName = generateLongName(region.name, parents);
        const children = hasChildren(region._id, allRegionIds);

        bulkOps.push({
          updateOne: {
            filter: { _id: region._id },
            update: { $set: { parents, longName, hasChildren: children } },
          },
        });
      }

      if (bulkOps.length > 0) {
        const result = await Region.bulkWrite(bulkOps);
        updated += result.modifiedCount || 0;
      }

      processed += batch.length;
      console.log(
        `Processed ${processed}/${regions.length} regions (${Math.round((processed / regions.length) * 100)}%)`
      );
    }

    console.log("\nRegion parent generation completed!");
    console.log(`Total regions processed: ${processed}`);
    console.log(`Total regions updated: ${updated}`);
  } catch (error) {
    console.error("Error during region parent generation:", error);
    process.exit(1);
  }
};

main();
