import { Hono } from "hono";
import bcrypt from "bcryptjs";
import {
  createUser,
  getUser,
  getUserByEmail,
  createSession,
  validateSessionToken,
  deleteSession,
  recordLoginAttempt,
  isRateLimited,
  verifyRequestOrigin,
  sendVerificationEmail,
  verifyEmailToken,
  markEmailAsVerified,
  deleteEmailVerificationToken,
  createPasswordResetToken,
  verifyPasswordResetToken,
  deletePasswordResetToken,
  updateUserPassword,
} from "../lib/auth.js";
import { sendPasswordResetEmail } from "../lib/email.js";
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

    await sendVerificationEmail(user.id, email);

    return c.json({
      message: "Account created successfully. Please check your email to verify your account.",
      email: user.email,
    });
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

    if (!user.emailVerified) {
      await recordLoginAttempt(email, ipAddress, false);
      await sendVerificationEmail(user.id, email);
      return c.json(
        {
          error: "Please verify your email address before logging in. A new verification email has been sent.",
          needsVerification: true,
          email: user.email,
        },
        401
      );
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

auth.post("/verify-email", async (c) => {
  const origin = c.req.header("Origin") || null;
  const method = c.req.method;

  if (!(await verifyRequestOrigin(method, origin))) {
    return c.json({ error: "Invalid origin" }, 403);
  }

  const { token } = await c.req.json();

  if (!token) {
    return c.json({ error: "Verification token is required" }, 400);
  }

  try {
    const userId = await verifyEmailToken(token);
    if (!userId) {
      return c.json({ error: "Invalid or expired verification token" }, 400);
    }

    await markEmailAsVerified(userId);
    await deleteEmailVerificationToken(token);

    const user = await getUser(userId);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({
      message: "Email verified successfully! You can now log in.",
      email: user.email,
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

auth.post("/resend-verification", async (c) => {
  const origin = c.req.header("Origin") || null;
  const method = c.req.method;

  if (!(await verifyRequestOrigin(method, origin))) {
    return c.json({ error: "Invalid origin" }, 403);
  }

  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    if (user.emailVerified) {
      return c.json({ error: "Email is already verified" }, 400);
    }

    await sendVerificationEmail(user.id, email);

    return c.json({
      message: "Verification email sent successfully.",
      email: user.email,
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

auth.post("/forgot-password", async (c) => {
  const origin = c.req.header("Origin") || null;
  const method = c.req.method;

  if (!(await verifyRequestOrigin(method, origin))) {
    return c.json({ error: "Invalid origin" }, 403);
  }

  try {
    const { email } = await c.req.json();

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    await sendPasswordResetEmail(user.email, await createPasswordResetToken(user.id));

    return c.json({
      message: "Password reset email sent successfully.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

auth.post("/reset-password", async (c) => {
  const origin = c.req.header("Origin") || null;
  const method = c.req.method;

  if (!(await verifyRequestOrigin(method, origin))) {
    return c.json({ error: "Invalid origin" }, 403);
  }

  try {
    const { token, password } = await c.req.json();

    if (!token || !password) {
      return c.json({ error: "Token and password are required" }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters long" }, 400);
    }

    const userId = await verifyPasswordResetToken(token);
    if (!userId) {
      return c.json({ error: "Invalid or expired reset token" }, 400);
    }

    await updateUserPassword(userId, password);
    await deletePasswordResetToken(token);

    const user = await getUser(userId);
    if (user && !user.emailVerified) {
      await markEmailAsVerified(userId);
    }

    return c.json({
      message: "Password reset successfully.",
      email: user?.email,
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default auth;
