import { Hono } from "hono";
import bcrypt from "bcryptjs";
import {
  createUser,
  getUserByEmail,
  createSession,
  validateSessionToken,
  deleteSession,
  recordLoginAttempt,
  isRateLimited,
  verifyRequestOrigin,
} from "../lib/auth.js";
import type { User } from "../lib/types.js";

const auth = new Hono();

type SignupRequest = {
  email: string;
  password: string;
};

type LoginRequest = {
  email: string;
  password: string;
};

type AuthResponse = {
  user: Omit<User, "password">;
  session: {
    id: string;
    userId: string;
    createdAt: string;
  };
};

auth.post("/signup", async (c) => {
  const origin = c.req.header("Origin") || null;
  const method = c.req.method;

  if (!(await verifyRequestOrigin(method, origin))) {
    return c.json({ error: "Invalid origin" }, 403);
  }

  try {
    const { email, password }: SignupRequest = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters long" }, 400);
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return c.json({ error: "User already exists" }, 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await createUser(email, hashedPassword);
    const session = await createSession(user.id);

    const response: AuthResponse = {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      session: {
        id: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
      },
    };

    c.header("Set-Cookie", `session_token=${session.token}; Max-Age=31536000; HttpOnly; Secure; Path=/; SameSite=Lax`);

    return c.json(response);
  } catch (error) {
    console.error("Signup error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

auth.post("/login", async (c) => {
  const origin = c.req.header("Origin") || null;
  const method = c.req.method;
  const ipAddress = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown";

  if (!(await verifyRequestOrigin(method, origin))) {
    return c.json({ error: "Invalid origin" }, 403);
  }

  try {
    const { email, password }: LoginRequest = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    if (await isRateLimited(email, ipAddress)) {
      return c.json({ error: "Too many login attempts. Please try again later." }, 429);
    }

    const user = await getUserByEmail(email);
    if (!user) {
      await recordLoginAttempt(email, ipAddress, false);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const isValidPassword = await bcrypt.compare(password, user.password || "");
    if (!isValidPassword) {
      await recordLoginAttempt(email, ipAddress, false);
      return c.json({ error: "Invalid credentials" }, 401);
    }

    await recordLoginAttempt(email, ipAddress, true);
    const session = await createSession(user.id);

    const response: AuthResponse = {
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      session: {
        id: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
      },
    };

    c.header("Set-Cookie", `session_token=${session.token}; Max-Age=31536000; HttpOnly; Secure; Path=/; SameSite=Lax`);

    return c.json(response);
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

auth.post("/logout", async (c) => {
  const sessionToken = c.req.header("Cookie")?.match(/session_token=([^;]+)/)?.[1];

  if (sessionToken) {
    const session = await validateSessionToken(sessionToken);
    if (session) {
      await deleteSession(session.id);
    }
  }

  c.header("Set-Cookie", "session_token=; Max-Age=0; HttpOnly; Secure; Path=/; SameSite=Lax");

  return c.json({ success: true });
});

auth.get("/me", async (c) => {
  const sessionToken = c.req.header("Cookie")?.match(/session_token=([^;]+)/)?.[1];

  if (!sessionToken) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await validateSessionToken(sessionToken);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await getUserByEmail(session.userId);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

export default auth;
