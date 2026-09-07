// Pure validation for WireGuard management addressing.
//
// Hard product rule: the tunnel carries MANAGEMENT traffic only. Hotspot guest
// traffic must keep leaving through the router's own ISP, so a peer may only
// ever hold a single /32 management address and no default route, NAT or
// forwarding.

export const ROUTE_REJECTED =
  "Only a single /32 management route is allowed. Default routes, NAT and forwarding would send guest traffic through the gateway.";

export const ROUTE_MISMATCH =
  "The provisioner returned a different management route than the one requested.";

const IPV4_32 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/32$/;

const FORBIDDEN = new Set(["0.0.0.0/0", "::/0", "::0/0", "0.0.0.0/1", "128.0.0.0/1"]);

/** Canonical decimal octet: no leading zeros, "0" itself is the only exception. */
function isCanonicalOctet(part: string): boolean {
  if (!/^\d{1,3}$/.test(part)) return false;
  if (part.length > 1 && part.startsWith("0")) return false;
  const n = Number(part);
  return n >= 0 && n <= 255;
}

export function isManagementAddress(value: string): boolean {
  const addr = (value ?? "").trim();
  if (FORBIDDEN.has(addr)) return false;
  const m = IPV4_32.exec(addr);
  if (!m) return false;
  return m.slice(1, 5).every((part) => isCanonicalOctet(part as string));
}

/** Normalised comparison form; only defined for canonical management addresses. */
export function canonicalAddress(value: string): string | null {
  const addr = (value ?? "").trim();
  return isManagementAddress(addr) ? addr : null;
}

export type PeerRouteRequest = {
  address: string;
  allowedIps?: string[];
  nat?: boolean;
  forwarding?: boolean;
  defaultRoute?: boolean;
};

/** Throws unless the request is a single, non-forwarding /32 management route. */
export function assertManagementOnlyRoutes(req: PeerRouteRequest): void {
  if (req.nat || req.forwarding || req.defaultRoute) throw new Error(ROUTE_REJECTED);
  if (!isManagementAddress(req.address)) throw new Error(ROUTE_REJECTED);
  const allowed = req.allowedIps ?? [req.address];
  if (allowed.length !== 1) throw new Error(ROUTE_REJECTED);
  const only = allowed[0] ?? "";
  if (!isManagementAddress(only)) throw new Error(ROUTE_REJECTED);
  if (only.trim() !== req.address.trim()) throw new Error(ROUTE_REJECTED);
}

/**
 * The provisioner must return exactly the requested management /32 — both as
 * the peer address and, when reported, as the only AllowedIPs entry.
 */
export function assertExactManagementRoute(
  requested: string,
  returnedAddress: string,
  returnedAllowedIps?: string[] | null,
): void {
  const want = canonicalAddress(requested);
  const got = canonicalAddress(returnedAddress);
  if (!want || !got || want !== got) throw new Error(ROUTE_MISMATCH);
  if (returnedAllowedIps != null) {
    if (returnedAllowedIps.length !== 1) throw new Error(ROUTE_MISMATCH);
    if (canonicalAddress(returnedAllowedIps[0] ?? "") !== want) throw new Error(ROUTE_MISMATCH);
  }
}
