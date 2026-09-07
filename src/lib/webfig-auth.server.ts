import { hmacKeyMaterial, signRequest } from "./wireguard/vps.server";

export const WEBFIG_LAUNCH_TTL_MS = 60_000;

/**
 * A short-lived, peer-bound capability consumed only by Magic Hub. It is not
 * an app login token and must never be generated in browser code.
 */
export function webfigTokenCanonical(
  scope: "webfig:launch" | "webfig:session",
  peerId: string,
  expiresAt: string,
): string {
  return [scope, peerId, expiresAt].join("\n");
}

export function signWebfigToken(
  secret: string,
  scope: "webfig:launch" | "webfig:session",
  peerId: string,
  expiresAt: string,
): string {
  return signRequest(
    secret,
    webfigTokenCanonical(scope, peerId, expiresAt),
    hmacKeyMaterial(secret),
  );
}
