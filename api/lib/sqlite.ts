import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type {
  Hotspot,
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
  packs: Pack;
  regions: Region;
  hotspots_rtree: { rowId: number; minLat: number; maxLat: number; minLng: number; maxLng: number };
  user: User;
  session: Session;
  login_attempt: LoginAttempt;
  email_verification_token: EmailVerificationToken;
  password_reset_token: PasswordResetToken;
};

const db = new Kysely<DatabaseSchema>({
  dialect: new SqliteDialect({
    database: new (Database as any)("../openbirding.db"),
  }),
});

export default db;
