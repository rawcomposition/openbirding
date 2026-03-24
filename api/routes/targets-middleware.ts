import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { isTargetsDbAvailable } from "../db/index.js";

export const requireTargetsDb: MiddlewareHandler = async (_c, next) => {
  if (!isTargetsDbAvailable()) {
    throw new HTTPException(503, { message: "Targets database unavailable" });
  }
  await next();
};
