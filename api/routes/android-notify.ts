import { Hono } from "hono";
import db from "../db/index.js";

const androidNotifyRoute = new Hono();

androidNotifyRoute.post("/", async (c) => {
  const body = await c.req.json();
  const email = body.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ message: "A valid email address is required" }, 400);
  }

  const existing = await db
    .selectFrom("android")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();

  if (existing) {
    return c.json({ success: true, message: "You're already signed up!" });
  }

  await db.insertInto("android").values({ email }).execute();

  return c.json({ success: true, message: "You'll be notified when the Android version is available!" });
});

export default androidNotifyRoute;
