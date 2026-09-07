/**
 * Address safety + bounded fallback discovery candidates.
 *
 * The connector may only ever talk to private/link-local addresses on the
 * customer LAN. The public internet is never scanned or probed.
 */

/** RouterOS factory default address — always worth a look. */
export const ROUTEROS_DEFAULT_IP = "192.168.88.1";

/** Hard ceiling on how many addresses a fallback sweep may touch. */
export const MAX_FALLBACK_CANDIDATES = 64;

export function parseIPv4(ip) {
  if (typeof ip !== "string") return null;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

export function isPrivateIPv4(ip) {
  const p = parseIPv4(ip);
  if (!p) return false;
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 127) return true; // loopback (local agent itself)
  return false;
}

export function ipToInt(ip) {
  const p = parseIPv4(ip);
  if (!p) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

export function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/**
 * Bounded candidate list for fallback detection when MNDP finds nothing.
 *
 * - always includes 192.168.88.1;
 * - for a /24 or smaller network, enumerates hosts up to the hard cap;
 * - for anything larger, only probes the likely gateway addresses.
 */
export function fallbackCandidates(cidr, max = MAX_FALLBACK_CANDIDATES) {
  const limit = Math.max(1, Math.min(max, MAX_FALLBACK_CANDIDATES));
  const out = [ROUTEROS_DEFAULT_IP];

  const push = (ip) => {
    if (!ip || out.includes(ip)) return;
    if (!isPrivateIPv4(ip)) return;
    if (out.length >= limit) return;
    out.push(ip);
  };

  if (typeof cidr === "string" && cidr.includes("/")) {
    const [addr, prefixRaw] = cidr.split("/");
    const prefix = Number(prefixRaw);
    const base = ipToInt(addr);
    if (
      base != null &&
      Number.isInteger(prefix) &&
      prefix >= 8 &&
      prefix <= 32 &&
      isPrivateIPv4(addr)
    ) {
      const size = 2 ** (32 - prefix);
      const network = (base & (size === 4294967296 ? 0 : ~(size - 1))) >>> 0;
      if (prefix >= 24) {
        for (let i = 1; i < size - 1 && out.length < limit; i++) push(intToIp(network + i));
      } else {
        // Too large to enumerate safely: probe only plausible gateways.
        push(intToIp(network + 1));
        push(intToIp(network + 254));
        push(addr);
      }
    }
  }

  return out.slice(0, limit);
}

/**
 * Cloud calls must use HTTPS. The single exception is an explicit
 * localhost-only development override, which still refuses any remote host.
 */
export function assertCloudBaseUrl(rawUrl, { allowInsecureLocalhost = false } = {}) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new Error(`Invalid MikroMagic base URL: ${rawUrl}`);
  }
  const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && localhost && allowInsecureLocalhost) return url;
  throw new Error(
    "Refusing to send data to the cloud over plain HTTP. Use an https:// base URL (plain HTTP is only allowed for localhost development with MIKROMAGIC_ALLOW_INSECURE_LOCALHOST=1).",
  );
}
