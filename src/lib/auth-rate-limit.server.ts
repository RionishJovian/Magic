import { createHash } from "node:crypto";
import { rateLimit } from "./connector-guard.server";

export const AUTH_RATE_LIMIT_MESSAGE =
  "Too many sign-in attempts. Please wait a minute and try again.";

/** Never use a raw identifier as a durable telemetry key. */
export function authAttemptKey(kind: "ip" | "identifier", value: string): string {
  const normalized = value.trim().toLowerCase().slice(0, 200);
  const digest = createHash("sha256").update(normalized).digest("hex");
  return `auth:${kind}:v1:${digest}`;
}

/**
 * Shared, database-backed limiter for login identifier resolution.
 * A limiter outage is fail-closed: resolving an identifier must not proceed
 * when abuse protection cannot be evaluated.
 */
export async function assertAuthAttemptAllowed(input: {
  ip: string;
  identifier: string;
}): Promise<void> {
  const [ipAllowed, identifierAllowed] = await Promise.all([
    rateLimit(authAttemptKey("ip", input.ip || "unknown"), 10, 60),
    rateLimit(authAttemptKey("identifier", input.identifier), 5, 60),
  ]);
  if (!ipAllowed || !identifierAllowed) throw new Error(AUTH_RATE_LIMIT_MESSAGE);
}
