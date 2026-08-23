import { pgDb, migratePostgres } from "../db/postgres.js";

await migratePostgres();
await pgDb.destroy();
