// Server-only router endpoint validator.
//
// Every place that saves or dials a router endpoint runs through here first.
// The rules are deliberately strict: a router endpoint is a bare hostname or
// IP literal plus a separate numeric port. URLs, paths, userinfo, query
// strings and embedded ports are rejected, and any address that resolves into
// a private / loopback / reserved range is refused so the cloud can never be
// used to probe internal infrastructure (SSRF).

export type HostKind = "ipv4" | "ipv6" | "hostname";

export class EndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EndpointError";
  }
}

const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    if (p.length > 1 && p.startsWith("0")) return null; // no octal-ish forms
    out.push(n);
  }
  return out;
}

/** Expand an IPv6 literal into its 8 groups, or null when malformed. */
export function parseIpv6(value: string): number[] | null {
  let v = value.trim();
  if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1);
  if (!/^[0-9a-f:.]+$/i.test(v)) return null;
  if (v.includes(":::")) return null;

  // Trailing IPv4 form (::ffff:1.2.3.4)
  let tail: number[] = [];
  const lastColon = v.lastIndexOf(":");
  const maybeV4 = v.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const quad = parseIpv4(maybeV4);
    if (!quad) return null;
    tail = [(quad[0]! << 8) | quad[1]!, (quad[2]! << 8) | quad[3]!];
    v = v.slice(0, lastColon + 1) + "0:0";
  }

  const halves = v.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string): number[] | null => {
    if (!s) return [];
    const out: number[] = [];
    for (const g of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : null;
  if (!head || (halves.length === 2 && !rest)) return null;

  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - rest!.length;
    if (fill < 1) return null;
    groups = [...head, ...Array(fill).fill(0), ...rest!];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  if (tail.length) {
    groups[6] = tail[0]!;
    groups[7] = tail[1]!;
  }
  return groups;
}

/** Reason string when an IPv4 address must not be dialled, else null. */
export function unsafeIpv4Reason(quad: number[]): string | null {
  const [a, b, c] = quad as [number, number, number, number];
  if (a === 0) return "an unspecified/this-network address";
  if (a === 10) return "a private address";
  if (a === 127) return "a loopback address";
  if (a === 169 && b === 254) return "a link-local address";
  if (a === 172 && b >= 16 && b <= 31) return "a private address";
  if (a === 192 && b === 168) return "a private address";
  if (a === 100 && b >= 64 && b <= 127) return "a carrier-grade NAT (CGNAT) address";
  if (a === 192 && b === 0 && c === 0) return "an IETF protocol assignment address";
  if (a === 192 && b === 0 && c === 2) return "a documentation address";
  if (a === 198 && b === 51 && c === 100) return "a documentation address";
  if (a === 203 && b === 0 && c === 113) return "a documentation address";
  if (a === 192 && b === 88 && c === 99) return "a deprecated 6to4 relay address";
  if (a === 198 && (b === 18 || b === 19)) return "a benchmarking address";
  if (a >= 224 && a <= 239) return "a multicast address";
  if (a >= 240) return "a reserved address";
  return null;
}

export function unsafeIpv6Reason(groups: number[]): string | null {
  const g = groups;
  const isZeroPrefix = g.slice(0, 5).every((x) => x === 0);
  if (isZeroPrefix && g[5] === 0xffff) {
    const quad = [g[6]! >> 8, g[6]! & 0xff, g[7]! >> 8, g[7]! & 0xff];
    return unsafeIpv4Reason(quad) ? `an IPv4-mapped ${unsafeIpv4Reason(quad)}` : null;
  }
  if (g.every((x) => x === 0)) return "an unspecified address";
  if (isZeroPrefix && g[5] === 0 && g[6] === 0 && g[7] === 1) return "a loopback address";
  if ((g[0]! & 0xffc0) === 0xfe80) return "a link-local address";
  if ((g[0]! & 0xfe00) === 0xfc00) return "a unique-local (private) address";
  if ((g[0]! & 0xff00) === 0xff00) return "a multicast address";
  if (g[0] === 0x2001 && g[1] === 0x0db8) return "a documentation address";
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return "a discard-only address";
  if (g[0] === 0x0064 && g[1] === 0xff9b) return "a NAT64 translation address";
  return null;
}

export function classifyHost(raw: string): { kind: HostKind; host: string } | { error: string } {
  const host = (raw ?? "").trim();
  if (!host) return { error: "Enter the router address." };
  if (host.length > 253) return { error: "That address is too long." };
  if (/\s/.test(host)) return { error: "The address cannot contain spaces." };
  if (/:\/\//.test(host) || /^[a-z]+:\/\//i.test(host))
    return { error: "Enter only the address — no https:// prefix." };
  if (host.includes("/")) return { error: "Enter only the address — no path or slash." };
  if (host.includes("@")) return { error: "Enter only the address — no username@ part." };
  if (host.includes("?") || host.includes("#"))
    return { error: "Enter only the address — no query string." };
  if (host.startsWith("[") || host.endsWith("]") || host.includes("%"))
    return { error: "Enter the IPv6 address without brackets or a zone id." };

  const quad = parseIpv4(host);
  if (quad) {
    const bad = unsafeIpv4Reason(quad);
    if (bad) return { error: `${host} is ${bad} and cannot be reached from the cloud.` };
    return { kind: "ipv4", host };
  }

  if (host.includes(":")) {
    // A colon here is either an IPv6 literal or an illegal embedded port.
    const groups = parseIpv6(host);
    if (!groups) return { error: "Enter the address without a port — the port has its own field." };
    const bad = unsafeIpv6Reason(groups);
    if (bad) return { error: `${host} is ${bad} and cannot be reached from the cloud.` };
    return { kind: "ipv6", host: host.toLowerCase() };
  }

  if (!HOSTNAME_RE.test(host)) return { error: "That is not a valid hostname or IP address." };
  if (/^localhost$/i.test(host) || /\.local$/i.test(host) || /\.internal$/i.test(host))
    return {
      error: `${host} points at a local network name and cannot be reached from the cloud.`,
    };
  if (!host.includes("."))
    return { error: "Use the full hostname, for example router.example.com." };
  return { kind: "hostname", host: host.toLowerCase() };
}

export function validatePort(port: unknown): { port: number } | { error: string } {
  if (typeof port !== "number" || !Number.isInteger(port))
    return { error: "The port must be a whole number." };
  if (port < 1 || port > 65535) return { error: "The port must be between 1 and 65535." };
  return { port };
}

/**
 * Shape-only classification for Magic Hub labels. Private / CGNAT / loopback
 * literals are allowed because the cloud never dials this host after the
 * WireGuard peer is connected — it is a human label (often Cloud DDNS).
 */
export function classifyHubHostLabel(
  raw: string,
): { kind: HostKind; host: string } | { error: string } {
  const host = (raw ?? "").trim();
  if (!host) return { error: "Enter the router address." };
  if (host.length > 253) return { error: "That address is too long." };
  if (/\s/.test(host)) return { error: "The address cannot contain spaces." };
  if (/:\/\//.test(host) || /^[a-z]+:\/\//i.test(host))
    return { error: "Enter only the address — no https:// prefix." };
  if (host.includes("/")) return { error: "Enter only the address — no path or slash." };
  if (host.includes("@")) return { error: "Enter only the address — no username@ part." };
  if (host.includes("?") || host.includes("#"))
    return { error: "Enter only the address — no query string." };
  if (host.startsWith("[") || host.endsWith("]") || host.includes("%"))
    return { error: "Enter the IPv6 address without brackets or a zone id." };

  const quad = parseIpv4(host);
  if (quad) return { kind: "ipv4", host };

  if (host.includes(":")) {
    const groups = parseIpv6(host);
    if (!groups) return { error: "Enter the address without a port — the port has its own field." };
    return { kind: "ipv6", host: host.toLowerCase() };
  }

  if (!HOSTNAME_RE.test(host)) return { error: "That is not a valid hostname or IP address." };
  // Never dialled — a single-label nickname (kyaw-coffee) is enough.
  return { kind: "hostname", host: host.toLowerCase() };
}

/** Validate a Magic Hub board label + port. Never resolves DNS. */
export function assertHubHostLabel(
  rawHost: string,
  rawPort: unknown,
): { host: string; kind: HostKind; port: number } {
  const cls = classifyHubHostLabel(rawHost);
  if ("error" in cls) throw new EndpointError(cls.error);
  const p = validatePort(rawPort);
  if ("error" in p) throw new EndpointError(p.error);
  return { host: cls.host, kind: cls.kind, port: p.port };
}

export type SafeEndpoint = {
  host: string;
  kind: HostKind;
  port: number;
  /** Resolved literal address, when a lookup was performed. */
  address: string | null;
};

/**
 * Full check: shape, safety and (for hostnames) DNS resolution safety.
 * Throws EndpointError with a user-friendly message.
 */
export async function assertSafeEndpoint(
  rawHost: string,
  rawPort: unknown,
  opts: { resolve?: boolean } = {},
): Promise<SafeEndpoint> {
  const cls = classifyHost(rawHost);
  if ("error" in cls) throw new EndpointError(cls.error);
  const p = validatePort(rawPort);
  if ("error" in p) throw new EndpointError(p.error);

  if (cls.kind !== "hostname") {
    return { host: cls.host, kind: cls.kind, port: p.port, address: cls.host };
  }
  if (opts.resolve === false) {
    return { host: cls.host, kind: cls.kind, port: p.port, address: null };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    const dns = await import("node:dns/promises");
    addresses = await dns.lookup(cls.host, { all: true });
  } catch {
    throw new EndpointError(
      `"${cls.host}" does not resolve to an address. Check the DDNS name or DNS record.`,
    );
  }
  if (!addresses.length) throw new EndpointError(`"${cls.host}" does not resolve to an address.`);

  for (const a of addresses) {
    const reason =
      a.family === 4
        ? unsafeIpv4Reason(parseIpv4(a.address) ?? [0, 0, 0, 0])
        : unsafeIpv6Reason(parseIpv6(a.address) ?? new Array(8).fill(0));
    if (reason)
      throw new EndpointError(
        `"${cls.host}" resolves to ${a.address}, which is ${reason}. Point it at the router's public address instead.`,
      );
  }
  return { host: cls.host, kind: cls.kind, port: p.port, address: addresses[0]!.address };
}
