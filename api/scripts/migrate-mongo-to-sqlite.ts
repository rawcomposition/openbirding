import "dotenv/config";
import connect from "../lib/db.js";
import Region from "../models/Region.js";
import db from "../lib/sqlite.js";
import { sql } from "kysely";

interface MongoRegion {
  _id: string;
  name: string;
  longName?: string;
  parents?: { id: string; name: string }[];
  isCountry?: boolean;
  hasChildren?: boolean;
}

interface MongoHotspot {
  _id: string;
  id: string;
  name: string;
  region: string;
  country?: string;
  state?: string;
  county?: string;
  species: number;
  lat: number;
  lng: number;
  open?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface MongoPack {
  _id: string;
  region: string;
  hotspots?: number;
  lastSynced?: string;
}

const determineRegionLevel = (regionId: string): number => {
  const parts = regionId.split("-");
  if (parts.length === 1) return 1;
  if (parts.length === 2) return 2;
  return 3;
};

const migrateRegions = async () => {
  console.log("Starting region migration...");

  const mongoRegions = (await Region.find({}).lean()) as MongoRegion[];
  console.log(`Found ${mongoRegions.length} regions in MongoDB`);

  let inserted = 0;
  let updated = 0;

  for (const region of mongoRegions) {
    try {
      const level = determineRegionLevel(region._id);
      const parentsJson = region.parents ? JSON.stringify(region.parents) : null;
      const hasChildren = region.hasChildren ? 1 : 0;

      await db
        .insertInto("regions")
        .values({
          id: region._id,
          name: region.name,
          longName: region.longName || null,
          parents: parentsJson,
          level,
          hasChildren,
        })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            name: region.name,
            longName: region.longName || null,
            parents: parentsJson,
            level,
            hasChildren,
          })
        )
        .execute();

      inserted++;
      if (inserted % 100 === 0) {
        console.log(`Processed ${inserted}/${mongoRegions.length} regions`);
      }
    } catch (error) {
      console.error(`Error migrating region ${region._id}:`, error);
    }
  }

  console.log(`Region migration complete: ${inserted} processed`);
  return inserted;
};

const migrateHotspots = async () => {
  console.log("Starting hotspot migration...");

  const mongoHotspots = (await db.selectFrom("hotspots").selectAll().execute()) as MongoHotspot[];
  console.log(`Found ${mongoHotspots.length} hotspots in SQLite to migrate`);

  let updated = 0;

  for (const hotspot of mongoHotspots) {
    try {
      const { country, state, county } = parseRegion(hotspot.region);

      await db
        .updateTable("hotspots")
        .set({
          country: country || null,
          state: state || null,
          county: county || null,
          createdAt: hotspot.createdAt || new Date().toISOString(),
          updatedAt: hotspot.updatedAt || new Date().toISOString(),
        })
        .where("id", "=", hotspot.id)
        .execute();

      updated++;
      if (updated % 1000 === 0) {
        console.log(`Updated ${updated}/${mongoHotspots.length} hotspots`);
      }
    } catch (error) {
      console.error(`Error updating hotspot ${hotspot.id}:`, error);
    }
  }

  console.log(`Hotspot migration complete: ${updated} updated`);
  return updated;
};

const migratePacks = async () => {
  console.log("Starting pack migration...");

  const mongoPacks = (await db.selectFrom("packs").selectAll().execute()) as MongoPack[];
  console.log(`Found ${mongoPacks.length} packs in SQLite to migrate`);

  let updated = 0;

  for (const pack of mongoPacks) {
    try {
      await db
        .updateTable("packs")
        .set({
          lastSynced: pack.lastSynced || null,
        })
        .where("id", "=", pack._id)
        .execute();

      updated++;
      if (updated % 100 === 0) {
        console.log(`Updated ${updated}/${mongoPacks.length} packs`);
      }
    } catch (error) {
      console.error(`Error updating pack ${pack._id}:`, error);
    }
  }

  console.log(`Pack migration complete: ${updated} updated`);
  return updated;
};

const addForeignKeyConstraints = async () => {
  console.log("Checking foreign key constraints...");

  try {
    await db.executeQuery(sql`PRAGMA foreign_keys = ON`).compile(db);

    const pragmaResult = await db.executeQuery(sql`PRAGMA foreign_key_list(hotspots)`).compile(db);
    const existingConstraints = pragmaResult.rows || [];

    const hasHotspotConstraint = existingConstraints.some(
      (constraint: any) => constraint.name === "fk_hotspots_region"
    );

    if (!hasHotspotConstraint) {
      console.log("Warning: Foreign key constraint 'fk_hotspots_region' not found on hotspots table");
      console.log("This constraint should be added when the table is created in init-db.ts");
    } else {
      console.log("Foreign key constraint 'fk_hotspots_region' found on hotspots table");
    }

    const packPragmaResult = await db.executeQuery(sql`PRAGMA foreign_key_list(packs)`).compile(db);
    const existingPackConstraints = packPragmaResult.rows || [];

    const hasPackConstraint = existingPackConstraints.some((constraint: any) => constraint.name === "fk_packs_region");

    if (!hasPackConstraint) {
      console.log("Warning: Foreign key constraint 'fk_packs_region' not found on packs table");
      console.log("This constraint should be added when the table is created in init-db.ts");
    } else {
      console.log("Foreign key constraint 'fk_packs_region' found on packs table");
    }

    console.log("Foreign key constraint check completed");
  } catch (error) {
    console.error("Error checking foreign key constraints:", error);
    console.log("Note: Foreign key constraints should be defined in init-db.ts when tables are created");
  }
};

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

const validateData = async () => {
  console.log("Validating migrated data...");

  const regionCount = await db.selectFrom("regions").select(db.fn.count("id").as("count")).executeTakeFirst();
  const hotspotCount = await db.selectFrom("hotspots").select(db.fn.count("id").as("count")).executeTakeFirst();
  const packCount = await db.selectFrom("packs").select(db.fn.count("id").as("count")).executeTakeFirst();

  console.log(`Validation results:`);
  console.log(`- Regions: ${regionCount?.count || 0}`);
  console.log(`- Hotspots: ${hotspotCount?.count || 0}`);
  console.log(`- Packs: ${packCount?.count || 0}`);

  const orphanedHotspots = await db
    .selectFrom("hotspots as h")
    .leftJoin("regions as r", "h.region", "r.id")
    .where("r.id", "is", null)
    .select("h.id")
    .execute();

  const orphanedPacks = await db
    .selectFrom("packs as p")
    .leftJoin("regions as r", "p.region", "r.id")
    .where("r.id", "is", null)
    .select("p.id")
    .execute();

  console.log(`- Orphaned hotspots: ${orphanedHotspots.length}`);
  console.log(`- Orphaned packs: ${orphanedPacks.length}`);

  if (orphanedHotspots.length > 0 || orphanedPacks.length > 0) {
    console.warn("Warning: Found orphaned records that violate foreign key constraints");
  }
};

const main = async () => {
  try {
    console.log("Starting MongoDB to SQLite migration...");

    await connect();
    console.log("Connected to MongoDB");

    const regionsMigrated = await migrateRegions();
    const hotspotsMigrated = await migrateHotspots();
    const packsMigrated = await migratePacks();

    await addForeignKeyConstraints();
    await validateData();

    console.log("\nMigration completed successfully!");
    console.log(`Summary:`);
    console.log(`- Regions migrated: ${regionsMigrated}`);
    console.log(`- Hotspots updated: ${hotspotsMigrated}`);
    console.log(`- Packs updated: ${packsMigrated}`);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await db.destroy();
    process.exit(0);
  }
};

main();
