import crypto from "crypto";
import db from "./sqlite.js";
import type { User, Session, SessionWithToken, LoginAttempt } from "./types.js";

const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 365; // 1 year
const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60; // 15 minutes
const MAX_LOGIN_ATTEMPS = 5;

function generateSecureRandomString(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);

  let id = "";
  for (let i = 0; i < bytes.length; i++) {
    id += alphabet[bytes[i] >> 3];
  }
  return id;
}

async function hashSecret(secret: string): Promise<Uint8Array> {
  const secretBytes = new TextEncoder().encode(secret);
  const secretHashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);
  return new Uint8Array(secretHashBuffer);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let c = 0;
  for (let i = 0; i < a.byteLength; i++) {
    c |= a[i] ^ b[i];
  }
  return c === 0;
}

export async function createSession(userId: string): Promise<SessionWithToken> {
  const now = new Date().toISOString();
  const id = generateSecureRandomString();
  const secret = generateSecureRandomString();
  const secretHash = await hashSecret(secret);
  const token = `${id}.${secret}`;

  const session: SessionWithToken = {
    id,
    userId,
    secretHash,
    createdAt: now,
    token,
  };

  await db
    .insertInto("session")
    .values({
      id: session.id,
      userId: session.userId,
      secretHash: session.secretHash,
      createdAt: session.createdAt,
    })
    .execute();

  return session;
}

export async function validateSessionToken(token: string): Promise<Session | null> {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) {
    return null;
  }
  const sessionId = tokenParts[0];
  const sessionSecret = tokenParts[1];

  const session = await getSession(sessionId);
  if (!session) {
    return null;
  }

  const tokenSecretHash = await hashSecret(sessionSecret);
  const validSecret = constantTimeEqual(tokenSecretHash, session.secretHash);
  if (!validSecret) {
    return null;
  }

  return session;
}

async function getSession(sessionId: string): Promise<Session | null> {
  const now = new Date();

  const result = await db
    .selectFrom("session")
    .select(["id", "userId", "secretHash", "createdAt"])
    .where("id", "=", sessionId)
    .executeTakeFirst();

  if (!result) {
    return null;
  }

  const session: Session = {
    id: result.id,
    userId: result.userId,
    secretHash: result.secretHash,
    createdAt: result.createdAt,
  };

  const sessionDate = new Date(session.createdAt);
  if (now.getTime() - sessionDate.getTime() >= SESSION_EXPIRES_IN_SECONDS * 1000) {
    await deleteSession(sessionId);
    return null;
  }

  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.deleteFrom("session").where("id", "=", sessionId).execute();
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await db.deleteFrom("session").where("userId", "=", userId).execute();
}

export async function getUser(userId: string): Promise<User | null> {
  const result = await db
    .selectFrom("user")
    .select(["id", "email", "password", "emailVerified", "isAdmin", "createdAt", "updatedAt"])
    .where("id", "=", userId)
    .executeTakeFirst();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    email: result.email,
    password: result.password,
    emailVerified: result.emailVerified,
    isAdmin: result.isAdmin,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

export async function createUser(email: string, hashedPassword: string): Promise<User> {
  const now = new Date().toISOString();
  const userId = generateSecureRandomString();

  const user: User = {
    id: userId,
    email,
    password: hashedPassword,
    emailVerified: 0,
    isAdmin: 0,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .insertInto("user")
    .values({
      id: user.id,
      email: user.email,
      password: user.password,
      emailVerified: user.emailVerified,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .execute();

  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await db
    .selectFrom("user")
    .select(["id", "email", "password", "emailVerified", "isAdmin", "createdAt", "updatedAt"])
    .where("email", "=", email)
    .executeTakeFirst();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    email: result.email,
    password: result.password,
    emailVerified: result.emailVerified,
    isAdmin: result.isAdmin,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  };
}

export async function recordLoginAttempt(email: string, ipAddress: string, success: boolean): Promise<void> {
  const now = new Date().toISOString();

  await db
    .insertInto("login_attempt")
    .values({
      email,
      ipAddress,
      attemptedAt: now,
      success: success ? 1 : 0,
    })
    .execute();
}

export async function isRateLimited(email: string, ipAddress: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOGIN_ATTEMPT_WINDOW_SECONDS * 1000).toISOString();

  const attempts = await db
    .selectFrom("login_attempt")
    .select("id")
    .where("email", "=", email)
    .where("ipAddress", "=", ipAddress)
    .where("attemptedAt", ">=", windowStart)
    .where("success", "=", 0)
    .execute();

  return attempts.length >= MAX_LOGIN_ATTEMPS;
}

export async function verifyRequestOrigin(method: string, originHeader: string | null): Promise<boolean> {
  if (method === "GET" || method === "HEAD") {
    return true;
  }

  if (!originHeader) {
    return false;
  }

  const allowedOrigins = ["http://localhost:5173", "http://localhost:4173", "https://openbirding.com"];
  return allowedOrigins.includes(originHeader);
}

export function encodeSessionPublicJSON(session: Session): string {
  return JSON.stringify({
    id: session.id,
    userId: session.userId,
    createdAt: session.createdAt,
  });
}
