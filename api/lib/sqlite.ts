import Database from "better-sqlite3";
import { Kysely, SqliteDialect, CamelCasePlugin } from "kysely";
import type {
  Hotspot,
  HotspotRevision,
  Pack,
  Region,
  User,
  Session,
  LoginAttempt,
  EmailVerificationToken,
  PasswordResetToken,
} from "./types.js";

type DatabaseSchema = {
  hotspots: Hotspot;
  hotspot_revisions: HotspotRevision;
  packs: Pack;
  regions: Region;
  hotspots_rtree: { rowId: number; minLat: number; maxLat: number; minLng: number; maxLng: number };
  user: User;
  session: Session;
  login_attempt: LoginAttempt;
  email_verification_token: EmailVerificationToken;
  password_reset_token: PasswordResetToken;
};

const sqliteDb = new (Database as any)("../openbirding.db");

sqliteDb.pragma("foreign_keys = ON");

const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({
    database: sqliteDb,
  }),
  plugins: [new CamelCasePlugin()],
});

export default db;
