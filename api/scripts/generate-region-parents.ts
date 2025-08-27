import "dotenv/config";
import db from "../lib/sqlite.js";

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

    console.log("Connected to SQLite database");

    const query = regionCode
      ? db.selectFrom("regions").select(["id", "name"]).where("id", "like", `${regionCode}%`)
      : db.selectFrom("regions").select(["id", "name"]);

    const regions = await query.execute();
    console.log(`Found ${regions.length} regions to process`);

    const regionMap = new Map<string, string>();
    const allRegionIds = regions.map((r) => r.id);

    for (const region of regions) {
      regionMap.set(region.id, region.name);
    }

    const batchSize = 1000;
    let processed = 0;
    let updated = 0;

    for (let i = 0; i < regions.length; i += batchSize) {
      const batch = regions.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(regions.length / batchSize);

      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} regions)`);

      const batchUpdates = batch.map((region) => {
        const parents = getParentRegions(region.id, regionMap);
        const longName = generateLongName(region.name, parents);
        const children = hasChildren(region.id, allRegionIds);

        return {
          id: region.id,
          parents: JSON.stringify(parents),
          longName,
          hasChildren: children ? 1 : 0,
        };
      });

      for (const update of batchUpdates) {
        await db
          .updateTable("regions")
          .set({
            parents: update.parents,
            longName: update.longName,
            hasChildren: update.hasChildren,
          })
          .where("id", "=", update.id)
          .execute();

        updated++;
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
