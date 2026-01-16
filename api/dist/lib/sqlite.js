import Database from "better-sqlite3";
import { Kysely, SqliteDialect, CamelCasePlugin } from "kysely";
const sqliteDb = new Database(process.env.SQLITE_PATH);
if (!sqliteDb) {
    throw new Error("Failed to connect to SQLite database");
}
sqliteDb.pragma("foreign_keys = ON");
const db = new Kysely({
    dialect: new SqliteDialect({
        database: sqliteDb,
    }),
    plugins: [new CamelCasePlugin()],
});
export default db;
