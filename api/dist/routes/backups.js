import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import Database from "better-sqlite3";
import { promises as fs } from "fs";
import path from "path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
dayjs.extend(utc);
dayjs.extend(timezone);
import { NUM_BACKUPS_TO_KEEP } from "../lib/config.js";
const backupsRoute = new Hono();
backupsRoute.post("/create", async (c) => {
    const key = c.req.query("key");
    const authHeader = c.req.header("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
        throw new HTTPException(401, { message: "Unauthorized" });
    }
    const backupDir = process.env.SQLITE_BACKUP_DIR;
    const dbPath = process.env.SQLITE_PATH;
    try {
        if (!backupDir) {
            throw new Error("SQLITE_BACKUP_DIR is not set");
        }
        if (!dbPath) {
            throw new Error("SQLITE_PATH is not set");
        }
        await fs.mkdir(backupDir, { recursive: true });
        const timestamp = dayjs().tz("America/Los_Angeles").format("YYYY-MM-DD_HH-mm");
        const backupFile = path.join(backupDir, `backup-${timestamp}.db`);
        const sourceDb = new Database(dbPath, { readonly: true });
        try {
            await sourceDb.backup(backupFile);
            console.log(`Backup completed: ${backupFile}`);
        }
        finally {
            sourceDb.close();
        }
        await cleanupOldBackups(backupDir);
        return c.json({
            message: "Backup created successfully",
            path: backupFile,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error("Backup error:", error);
        throw new HTTPException(500, { message: error instanceof Error ? error.message : "Internal Server Error" });
    }
});
async function cleanupOldBackups(backupDir) {
    try {
        const files = await fs.readdir(backupDir);
        const backupFiles = files
            .filter((file) => file.startsWith("backup-") && file.endsWith(".db"))
            .map((file) => ({
            name: file,
            path: path.join(backupDir, file),
            stats: null,
        }));
        for (const file of backupFiles) {
            file.stats = await fs.stat(file.path);
        }
        backupFiles.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
        if (backupFiles.length > NUM_BACKUPS_TO_KEEP) {
            const filesToDelete = backupFiles.slice(NUM_BACKUPS_TO_KEEP);
            for (const file of filesToDelete) {
                await fs.unlink(file.path);
                console.log(`Deleted old backup: ${file.name}`);
            }
        }
    }
    catch (error) {
        console.error("Error cleaning up old backups:", error);
    }
}
backupsRoute.get("/list", async (c) => {
    const key = c.req.query("key");
    const authHeader = c.req.header("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && key !== process.env.CRON_SECRET) {
        throw new HTTPException(401, { message: "Unauthorized" });
    }
    const backupDir = process.env.SQLITE_BACKUP_DIR;
    try {
        if (!backupDir) {
            throw new Error("SQLITE_BACKUP_DIR is not set");
        }
        const files = await fs.readdir(backupDir);
        const backupFiles = files
            .filter((file) => file.startsWith("backup-") && file.endsWith(".db"))
            .map((file) => ({
            name: file,
            path: path.join(backupDir, file),
            stats: null,
        }));
        for (const file of backupFiles) {
            file.stats = await fs.stat(file.path);
        }
        backupFiles.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
        return c.json({
            backups: backupFiles.map((file) => ({
                name: file.name,
                size: file.stats.size,
                created: file.stats.mtime.toISOString(),
            })),
            total: backupFiles.length,
            maxBackups: NUM_BACKUPS_TO_KEEP,
        });
    }
    catch (error) {
        console.error("List backups error:", error);
        throw new HTTPException(500, { message: error instanceof Error ? error.message : "Internal Server Error" });
    }
});
export default backupsRoute;
