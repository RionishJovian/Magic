/** Canonical production origin for connector install commands. */
export const CONNECTOR_PRODUCTION_ORIGIN = "https://mikromagic.app";

/**
 * Install / pair commands pin production by default. On localhost (or 127.0.0.1)
 * they use the current origin so local agents talk to the local cloud.
 */
export function connectorInstallOrigin(
  hostname: string | undefined = typeof window !== "undefined"
    ? window.location.hostname
    : undefined,
  origin: string | undefined = typeof window !== "undefined" ? window.location.origin : undefined,
): string {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return origin || CONNECTOR_PRODUCTION_ORIGIN;
  }
  return CONNECTOR_PRODUCTION_ORIGIN;
}
