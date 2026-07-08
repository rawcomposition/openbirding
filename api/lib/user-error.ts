import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type UserFacingCause = { userFacing: true };

export function userError(status: ContentfulStatusCode, message: string): HTTPException {
  return new HTTPException(status, { message, cause: { userFacing: true } satisfies UserFacingCause });
}

export function userMessageFor(err: HTTPException): string | undefined {
  const cause = err.cause as Partial<UserFacingCause> | undefined;
  return cause?.userFacing ? err.message : undefined;
}
