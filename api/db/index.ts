export { db, setupDatabase, setupRegionsFts, type DatabaseSchema } from "./main.js";
export { default } from "./main.js";
export {
  getTargetsMetadata,
  isTargetsDbAvailable,
  swapTargetsDb,
  withTargetsDb,
  type TargetsDb,
  type TargetsDatabaseSchema,
} from "./targets.js";
