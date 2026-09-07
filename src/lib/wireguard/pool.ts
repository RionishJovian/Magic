// Pure allocation of management /32 addresses from the shared hub subnet.
//
// The hub subnet is shared by EVERY tenant, so "taken" is always a global set.
// Only host addresses are handed out: the network address, the hub address
// (first host) and the broadcast address are never allocated.

import { isManagementAddress } from "./routes";

const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

export const DEFAULT_HUB_SUBNET = "10.77.0.0/24";

function toInt(octets: number[]): number {
  return ((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!;
}

function toDotted(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

/** Parsed subnet, or null when the CIDR is malformed or unusably wide/narrow. */
export function parseSubnet(cidr: string): { first: number; last: number } | null {
  const m = CIDR.exec((cidr ?? "").trim());
  if (!m) return null;
  const octets = m.slice(1, 5).map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  const prefix = Number(m[5]);
  // /30 is the narrowest useful pool; /16 keeps the scan bounded.
  if (prefix < 16 || prefix > 30) return null;
  const size = 2 ** (32 - prefix);
  const network = (toInt(octets) & (size === 4294967296 ? 0 : ~(size - 1) >>> 0)) >>> 0;
  // Skip network + hub address, stop before broadcast.
  return { first: network + 2, last: network + size - 2 };
}

/**
 * The n-th free management address in the pool, or null when the pool is full.
 * `attempt` lets the caller skip past an address another tenant just claimed.
 */
export function nextManagementAddress(
  cidr: string,
  taken: readonly string[],
  attempt = 0,
): string | null {
  const range = parseSubnet(cidr);
  if (!range) return null;
  const used = new Set(
    taken
      .map((t) => (t ?? "").trim().split("/")[0])
      .filter((t): t is string => Boolean(t))
      .map((t) => t),
  );
  let skipped = 0;
  for (let value = range.first; value <= range.last; value += 1) {
    const dotted = toDotted(value);
    if (used.has(dotted)) continue;
    if (skipped < attempt) {
      skipped += 1;
      continue;
    }
    const candidate = `${dotted}/32`;
    return isManagementAddress(candidate) ? candidate : null;
  }
  return null;
}
