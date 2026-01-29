import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const NUM_BACKUPS_TO_KEEP = 7;
export const TARGETS_DB_PATH = path.resolve(__dirname, "../../targets-dec-2025.db");
