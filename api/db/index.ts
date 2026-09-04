export { db, setupDatabase, setupRegionsFts, type DatabaseSchema } from "./main.js";
export { default } from "./main.js";
export {
  getTargetsMetadata,
  isTargetsDbAvailable,
  swapTargetsDb,
  withTargetsDb,
  withRawTargetsDb,
  type TargetsDb,
  type TargetsDatabaseSchema,
  type RawTargetsAccess,
} from "./targets.js";
