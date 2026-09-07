/**
 * Local RouterOS discovery: MNDP listener first, bounded fallback probes second.
 * Never touches anything outside the local private network.
 */

import { createSocket } from "node:dgram";
import { connect as netConnect } from "node:net";
import { networkInterfaces } from "node:os";
import { parseMndpPacket, dedupeDevices } from "./mndp.mjs";
import { fallbackCandidates, isPrivateIPv4 } from "./net.mjs";

export const MNDP_PORT = 5678;

/** Listen for MNDP broadcasts for `ms` milliseconds. */
export function listenMndp(ms = 6000) {
  return new Promise((resolve) => {
    const found = [];
    let socket;
    try {
      socket = createSocket({ type: "udp4", reuseAddr: true });
    } catch {
      resolve([]);
      return;
    }
    const done = () => {
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      resolve(dedupeDevices(found));
    };
    socket.on("error", done);
    socket.on("message", (msg, rinfo) => {
      if (!isPrivateIPv4(rinfo.address)) return;
      const device = parseMndpPacket(msg, rinfo.address);
      if (device) found.push({ ...device, source: "mndp" });
    });
    socket.bind(MNDP_PORT, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        /* not fatal */
      }
      setTimeout(done, ms).unref?.();
    });
  });
}

/** Local IPv4 CIDRs of this machine, used to bound fallback probing. */
export function localCidrs() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal && net.cidr && isPrivateIPv4(net.address)) {
        out.push(net.cidr);
      }
    }
  }
  return out;
}

function probeTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = netConnect({ host, port, timeout: timeoutMs });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

/**
 * Fallback detection: bounded candidate list, TCP probe on the RouterOS
 * management ports only. No hostname resolution, no public addresses.
 */
export async function probeFallback({
  cidr = null,
  max = 64,
  timeoutMs = 400,
  concurrency = 16,
} = {}) {
  const candidates = fallbackCandidates(cidr, max);
  const found = [];
  let index = 0;

  async function worker() {
    for (;;) {
      const i = index++;
      if (i >= candidates.length) return;
      const ip = candidates[i];
      const httpsOpen = await probeTcp(ip, 443, timeoutMs);
      const winboxOpen = httpsOpen ? false : await probeTcp(ip, 8291, timeoutMs);
      if (httpsOpen || winboxOpen) {
        found.push({
          ip,
          mac: null,
          identity: null,
          version: null,
          platform: null,
          model: null,
          source: "probe",
          restLikely: httpsOpen,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker));
  return dedupeDevices(found);
}

/**
 * Which local address this machine uses to reach `host`. Used to restrict the
 * router's management service and magic-api user to exactly this /32.
 */
export function localSourceAddress(host, port = 443, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = netConnect({ host, port, timeout: timeoutMs });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.on("connect", () => finish(socket.localAddress ?? null));
    socket.on("timeout", () => finish(null));
    socket.on("error", () => finish(null));
  });
}

/** The /32 restriction derived from the source address, or null. */
export async function connectorSourceCidr(host, ports = [443, 8291, 22]) {
  for (const port of ports) {
    const ip = await localSourceAddress(host, port);
    const clean = typeof ip === "string" ? ip.replace(/^::ffff:/, "") : null;
    if (clean && isPrivateIPv4(clean)) return `${clean}/32`;
  }
  return null;
}

/**
 * MNDP first; only fall back to bounded probing when nothing answered.
 * When no private CIDR can be enumerated we still probe the RouterOS factory
 * default address, which is the whole point of the fallback.
 */
export async function discoverRouters({ mndpMs = 6000, cidr = null } = {}) {
  const viaMndp = await listenMndp(mndpMs);
  if (viaMndp.length) return viaMndp;
  const cidrs = cidr ? [cidr] : localCidrs();
  const results = [];
  if (!cidrs.length) {
    results.push(...(await probeFallback({ cidr: null })));
  } else {
    for (const c of cidrs.slice(0, 2)) results.push(...(await probeFallback({ cidr: c })));
  }
  return dedupeDevices(results);
}
