import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { validateSessionToken } from "./auth.js";

export async function requireAuth(c: Context<{ Variables: { userId: string } }>, next: Next) {
  const sessionToken = getCookie(c, "session_token");

  if (!sessionToken) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await validateSessionToken(sessionToken);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("userId", session.userId);

  await next();
}
