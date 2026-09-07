import { createServerFn } from "@tanstack/react-start";
import type { DatabaseClient } from "./database.types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { buildQuickSetupSoftRollbackCommands } from "./quick-setup-script";
import {
  DEFAULT_TRIAL_PROTECTED_MESSAGE,
  isDefaultTrialUser,
  isHotspotTrialUser,
} from "./hotspot-voucher-users";

async function loadConn(supabase: DatabaseClient, routerId: string) {
  const { loadRouterConn } = await import("./router-conn.server");
  return loadRouterConn(supabase, routerId);
}

const idInput = z.object({ routerId: z.string().uuid() });

// Verify Cloud DDNS by connecting to a public DDNS hostname (or public WAN IP)
// with the API credentials from Quick Setup. Must not dial private LAN addresses
// from the cloud — paste the hostname the setup script printed instead.
export const probeCloudDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        host: z.string().min(1).max(200),
        port: z.number().int().min(1).max(65535).default(443),
        username: z.string().min(1).max(80),
        password: z.string().min(1).max(200),
        useTls: z.boolean().default(true),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const privateDial = refusePrivateCloudDial(data.host);
    if (privateDial) {
      return { ok: false as const, error: privateDial };
    }
    const { routerAPI } = await import("./mikrotik.server");
    try {
      const cloud = await routerAPI.cloud({
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        useTls: data.useTls,
      });
      const dnsName = cloud["dns-name"]?.trim();
      const status = cloud.status ?? "";
      const enabled = cloud["ddns-enabled"] === "true";
      if (!enabled) {
        return {
          ok: false as const,
          error:
            "IP Cloud DDNS is disabled on the router. Run the setup script or enable /ip cloud.",
        };
      }
      if (!dnsName) {
        return {
          ok: false as const,
          error: `Cloud DDNS has no hostname yet (status: ${status || "unknown"}). Wait a few seconds and retry.`,
        };
      }
      return { ok: true as const, dnsName, publicAddress: cloud["public-address"] ?? null, status };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

// Public reachability diagnostic used in Quick Setup: figures out the caller's
// apparent public IP from proxy headers, flags private/CGNAT ranges, and tries
// a short TCP-ish probe (HTTPS on the requested port) from the server so users
// know up-front whether Cloud DDNS will actually be reachable.
function classifyIp(ip: string): {
  kind: "public" | "private" | "cgnat" | "loopback" | "linklocal" | "invalid";
  reason: string;
} {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
    return { kind: "invalid", reason: "Not an IPv4 address" };
  const [a, b] = ip.split(".").map(Number);
  if (a === 10) return { kind: "private", reason: "RFC1918 10.0.0.0/8" };
  if (a === 172 && b >= 16 && b <= 31) return { kind: "private", reason: "RFC1918 172.16.0.0/12" };
  if (a === 192 && b === 168) return { kind: "private", reason: "RFC1918 192.168.0.0/16" };
  if (a === 100 && b >= 64 && b <= 127)
    return { kind: "cgnat", reason: "CGNAT 100.64.0.0/10 — ISP shared address, inbound blocked" };
  if (a === 127) return { kind: "loopback", reason: "Loopback 127.0.0.0/8" };
  if (a === 169 && b === 254) return { kind: "linklocal", reason: "Link-local 169.254.0.0/16" };
  if (a === 0 || a >= 224) return { kind: "invalid", reason: "Reserved / multicast range" };
  return { kind: "public", reason: "Routable public IPv4" };
}

async function probePort(
  host: string,
  port: number,
  timeoutMs = 4000,
): Promise<{ reachable: boolean; detail: string; latencyMs: number | null }> {
  const { assertSafeEndpoint } = await import("./net/endpoint.server");
  try {
    await assertSafeEndpoint(host, port);
  } catch (e) {
    return {
      reachable: false,
      detail: e instanceof Error ? e.message : String(e),
      latencyMs: null,
    };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`https://${host}:${port}/`, {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "manual",
    });
    return {
      reachable: true,
      detail: `TLS handshake OK (HTTP ${res.status})`,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/certificate|self.?signed|SSL|TLS|protocol|handshake/i.test(msg)) {
      return {
        reachable: true,
        detail: `Port open, TLS negotiated (${msg})`,
        latencyMs: Date.now() - started,
      };
    }
    if (/aborted|timeout/i.test(msg))
      return { reachable: false, detail: `Timed out after ${timeoutMs}ms`, latencyMs: null };
    return { reachable: false, detail: msg, latencyMs: null };
  } finally {
    clearTimeout(t);
  }
}

/** Cloud-side checks must never dial RFC1918 / CGNAT literals. */
function refusePrivateCloudDial(host: string): string | null {
  const trimmed = host.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
    const kind = classifyIp(trimmed).kind;
    if (kind !== "public") {
      return `This check runs from the cloud and cannot dial a ${kind} address (${trimmed}). Enter the Cloud DDNS hostname (e.g. xxx.sn.mynetname.net) or a public WAN IP, or use Local Connector for LAN-only sites.`;
    }
  }
  return null;
}

export const checkPublicReachability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        // Optional host override: user can paste a DDNS name or WAN IP to test.
        // If omitted, we use the caller's public IP inferred from proxy headers.
        host: z.string().min(1).max(200).optional(),
        port: z.number().int().min(1).max(65535).default(443),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const xff = req.headers.get("x-forwarded-for") ?? "";
    const cfIp = req.headers.get("cf-connecting-ip") ?? "";
    const realIp = req.headers.get("x-real-ip") ?? "";
    const callerIp = cfIp.trim() || xff.split(",")[0]?.trim() || realIp.trim() || "";

    const target = data.host?.trim() || callerIp;
    if (!target) {
      return {
        ok: false as const,
        callerIp,
        target: null,
        error:
          "Couldn't determine your public IP from proxy headers. Enter your WAN IP or DDNS host manually.",
      };
    }

    // Only classify if the target looks like a bare IPv4 (no port, no scheme).
    const ipMatch = /^\d{1,3}(\.\d{1,3}){3}$/.test(target);
    const classification = ipMatch
      ? classifyIp(target)
      : { kind: "public" as const, reason: "Hostname — will be resolved by DNS" };

    let dnsHint: string | null = null;
    if (!ipMatch) {
      // Hostname: try to resolve via DNS-over-HTTPS so we can spot NXDOMAIN early.
      try {
        const r = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(target)}&type=A`,
          {
            headers: { accept: "application/dns-json" },
          },
        );
        const j = (await r.json()) as { Status: number; Answer?: { data: string }[] };
        if (j.Status !== 0 || !j.Answer?.length) {
          return {
            ok: false as const,
            callerIp,
            target,
            classification,
            error: `Hostname “${target}” could not be looked up yet. Cloud DDNS may still be initializing — copy the exact dns-name from /ip cloud print when status=updated.`,
          };
        }
        dnsHint = j.Answer.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a.data))?.data ?? null;
      } catch (e) {
        dnsHint = null;
      }
    }

    // Refuse to probe unreachable-by-design addresses.
    if (classification.kind !== "public") {
      return {
        ok: false as const,
        callerIp,
        target,
        classification,
        dnsHint,
        error:
          classification.kind === "cgnat"
            ? "Your public IP is inside CGNAT — the router won't be reachable from the internet even after Cloud DDNS. Use Magic Hub (the board dials out) or a Local Connector."
            : `Target ${target} is a ${classification.kind} address (${classification.reason}). Enter your WAN IP or DDNS host.`,
      };
    }

    const probe = await probePort(dnsHint ?? target, data.port);
    return {
      ok: probe.reachable,
      callerIp,
      target,
      dnsHint,
      classification,
      port: data.port,
      detail: probe.detail,
      latencyMs: probe.latencyMs,
      error: probe.reachable
        ? null
        : `Port ${data.port} on ${target} isn't answering from our server (${probe.detail}). Confirm the router is online, port 443 is open on the WAN firewall, and your ISP isn't blocking inbound.`,
    } as const;
  });

// ---------------------------------------------------------------------------
// Cloud Remote (DDNS + TLS) line check.
//
// Runs from the cloud against a public/DDNS host (never a LAN IP). Reads
// /ip cloud + /ip address when reachable, then probes whether the internet
// can reach the DDNS name on the REST port:
//   - public IP           → Cloud Remote works
//   - CGNAT / private WAN → must use the Local Connector instead
//   - public but port shut → firewall / port-forward problem
// ---------------------------------------------------------------------------
export const probeWanExposure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        host: z.string().min(1).max(200),
        port: z.number().int().min(1).max(65535).default(443),
        username: z.string().min(1).max(80),
        password: z.string().min(1).max(200),
        useTls: z.boolean().default(true),
        restPort: z.number().int().min(1).max(65535).default(443),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const privateDial = refusePrivateCloudDial(data.host);
    if (privateDial) {
      return {
        ok: false as const,
        verdict: "unreachable" as const,
        error: privateDial,
      };
    }

    const { routerAPI } = await import("./mikrotik.server");
    const conn = {
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password,
      useTls: data.useTls,
    };

    let cloud: Record<string, string> = {};
    try {
      cloud = (await routerAPI.cloud(conn)) as Record<string, string>;
    } catch (e) {
      return {
        ok: false as const,
        verdict: "unreachable" as const,
        error:
          e instanceof Error
            ? `Couldn't reach the router at ${data.host}:${data.port} — ${e.message}`
            : String(e),
      };
    }

    const ddnsName = cloud["dns-name"]?.trim() || null;
    const ddnsEnabled = cloud["ddns-enabled"] === "true";
    const cloudPublicAddress = cloud["public-address"]?.trim() || null;

    // WAN address as the router itself sees it (first non-private, else the
    // address on the interface carrying the default route).
    let wanAddress: string | null = null;
    try {
      const addrs = await routerAPI.addresses(conn);
      const bare = (a: Record<string, string>) => (a["address"] ?? "").split("/")[0] ?? "";
      const publicOne = addrs.find((a) => classifyIp(bare(a)).kind === "public");
      wanAddress =
        (publicOne ? bare(publicOne) : null) ??
        (addrs.length ? bare(addrs[addrs.length - 1]!) : null);
    } catch {
      wanAddress = null;
    }

    const cloudClass = cloudPublicAddress ? classifyIp(cloudPublicAddress) : null;
    const wanClass = wanAddress ? classifyIp(wanAddress) : null;

    // CGNAT signature: MikroTik Cloud reports a public address the router does
    // not own locally, or the WAN address itself is in a shared/private range.
    const isCgnat =
      cloudClass?.kind === "cgnat" ||
      wanClass?.kind === "cgnat" ||
      (!!cloudPublicAddress &&
        !!wanAddress &&
        wanClass?.kind !== "public" &&
        cloudPublicAddress !== wanAddress);

    if (isCgnat) {
      return {
        ok: false as const,
        verdict: "cgnat" as const,
        ddnsName,
        ddnsEnabled,
        cloudPublicAddress,
        wanAddress,
        port443Reachable: false,
        error:
          "This line is behind carrier-grade NAT (typical for Starlink and mobile ISPs). Inbound connections can't reach the router, so Cloud Remote won't work here — use Magic Hub on this site instead (the board dials out). Local Connector is the alternative if you have an always-on PC.",
      };
    }

    if (!ddnsEnabled || !ddnsName) {
      return {
        ok: false as const,
        verdict: "no-ddns" as const,
        ddnsName,
        ddnsEnabled,
        cloudPublicAddress,
        wanAddress,
        port443Reachable: false,
        error:
          "IP Cloud DDNS isn't active yet. Run the guided setup script (it enables /ip cloud) and retry in a few seconds.",
      };
    }

    const probe = await probePort(ddnsName, data.restPort);
    if (!probe.reachable) {
      return {
        ok: false as const,
        verdict: "port-closed" as const,
        ddnsName,
        ddnsEnabled,
        cloudPublicAddress,
        wanAddress,
        port443Reachable: false,
        latencyMs: probe.latencyMs,
        error: `${ddnsName}:${data.restPort} isn't answering from our servers (${probe.detail}). Open the port on the WAN firewall and make sure the www-ssl service is enabled.`,
      };
    }

    return {
      ok: true as const,
      verdict: "public" as const,
      ddnsName,
      ddnsEnabled,
      cloudPublicAddress,
      wanAddress,
      port443Reachable: true,
      latencyMs: probe.latencyMs,
      error: null,
    };
  });

export const getSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    const settled = await Promise.allSettled([
      routerAPI.activeUsers(conn),
      routerAPI.hosts(conn),
      routerAPI.users(conn),
      routerAPI.profiles(conn),
      routerAPI.listBindings(conn),
    ]);
    const valueOrEmpty = <T>(i: number): T[] => {
      const r = settled[i];
      return r?.status === "fulfilled" ? ((r.value as T[]) ?? []) : [];
    };
    const usersError =
      settled[2]?.status === "rejected"
        ? settled[2].reason instanceof Error
          ? settled[2].reason.message
          : String(settled[2].reason)
        : null;
    const active = valueOrEmpty<Record<string, string>>(0);
    const hosts = valueOrEmpty<Record<string, string>>(1);
    const users = valueOrEmpty<Record<string, string>>(2);
    const profiles = valueOrEmpty<Record<string, string>>(3);
    const bindings = valueOrEmpty<Record<string, string>>(4);

    // Surface unreachable boards instead of a silent empty voucher list.
    if (usersError && users.length === 0 && active.length === 0) {
      throw new Error(
        usersError.includes("fetch") || /ECONN|timeout|unreachable|401|403|404/i.test(usersError)
          ? `Router unreachable or Hotspot REST failed: ${usersError}`
          : usersError,
      );
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { markFirstUsesFromHotspot } = await import("./voucher-activation.server");
      await markFirstUsesFromHotspot({
        supabaseAdmin,
        routerId: data.routerId,
        users: (users ?? []) as Record<string, string>[],
        active: (active ?? []) as Record<string, string>[],
      });
    } catch {
      // Never fail Live / Vouchers because a notice could not be stored.
    }
    return { active, hosts, users, profiles, bindings, usersError };
  });

export const kickUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ routerId: z.string().uuid(), id: z.string().min(1) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    await routerAPI.removeActive(conn, data.id);
    return { ok: true };
  });

export const banMac = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        mac: z.string().regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i),
        comment: z.string().max(120).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    await routerAPI.banMac(conn, data.mac, data.comment);
    return { ok: true };
  });

export const removeBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ routerId: z.string().uuid(), id: z.string().min(1) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    await routerAPI.removeBinding(conn, data.id);
    return { ok: true };
  });

// Convenience: find the blocked binding for a MAC and remove it. Used from the
// Live users page so clients don't need to look up the internal .id.
export const unbanMac = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        mac: z.string().regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    const bindings = await routerAPI
      .listBindings(conn)
      .catch(() => [] as Array<Record<string, string>>);
    const wanted = data.mac.toUpperCase();
    let removed = 0;
    for (const b of bindings) {
      if ((b["mac-address"] ?? "").toUpperCase() === wanted && b.type === "blocked") {
        await routerAPI.removeBinding(conn, b[".id"]);
        removed++;
      }
    }
    return { ok: true, removed };
  });

export const setUserRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        id: z.string().min(1),
        rate: z.string().regex(/^\d+[KMG]?\/\d+[KMG]?$/i, "Format: up/down, e.g. 2M/5M"),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    await routerAPI.patchUser(conn, data.id, { "rate-limit": data.rate });
    return { ok: true };
  });

function assertNotProtectedHotspotUser(users: Array<Record<string, string>>, id: string): void {
  const row = users.find((u) => u[".id"] === id);
  if (isHotspotTrialUser(row) || isDefaultTrialUser(row?.name)) {
    throw new Error(DEFAULT_TRIAL_PROTECTED_MESSAGE);
  }
}

export const addVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        name: z.string().min(3).max(40),
        profile: z.string().min(1).max(60),
        comment: z.string().max(120).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    if (isDefaultTrialUser(data.name)) {
      throw new Error(DEFAULT_TRIAL_PROTECTED_MESSAGE);
    }
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    await routerAPI.addUser(conn, { ...data, password: data.name });
    return { ok: true };
  });

export const bulkVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        count: z.number().int().min(1).max(500),
        profile: z.string().min(1),
        prefix: z.string().max(10).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const codes: string[] = [];
    for (let i = 0; i < data.count; i++) {
      let code = data.prefix ?? "";
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      for (let j = 0; j < 8; j++) code += chars[bytes[j]! % chars.length];
      codes.push(code);
    }
    const results: { code: string; ok: boolean; error?: string }[] = [];
    for (const code of codes) {
      try {
        await routerAPI.addUser(conn, {
          name: code,
          password: code,
          profile: data.profile,
          comment: `batch ${new Date().toISOString().slice(0, 10)}`,
        });
        results.push({ code, ok: true });
      } catch (e) {
        results.push({ code, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { results };
  });

export const deleteVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ routerId: z.string().uuid(), id: z.string().min(1) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    const users = await routerAPI.users(conn).catch(() => [] as Array<Record<string, string>>);
    assertNotProtectedHotspotUser(users, data.id);
    const row = users.find((u) => u[".id"] === data.id);
    const code = row?.name;
    if (code) {
      const { data: ledger, error: ledgerError } = await context.supabase
        .from("voucher_codes")
        .select("order_id")
        .eq("router_id", data.routerId)
        .eq("code", code)
        .maybeSingle();
      if (ledgerError) throw new Error(ledgerError.message);

      if (ledger?.order_id) {
        const { data: order, error: orderError } = await context.supabase
          .from("payment_orders")
          .select("status")
          .eq("id", ledger.order_id)
          .maybeSingle();
        if (orderError) throw new Error(orderError.message);
        if (order?.status === "settled") {
          throw new Error(
            "This voucher has a settled payment. Refund the linked order in Payments before cancelling it.",
          );
        }
      }
    }

    await routerAPI.deleteUser(conn, data.id);
    if (code) {
      const { error } = await context.supabase
        .from("voucher_codes")
        .update({ status: "cancelled" })
        .eq("router_id", data.routerId)
        .eq("code", code)
        .neq("status", "cancelled");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// Mark a voucher as handed to a customer. Stamps the RouterOS user's
// comment with `redeemed <ISO date>[ · note]` so the vouchers page can
// separate unused stock from redeemed codes without a new table.
export const redeemVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        id: z.string().min(1),
        note: z.string().max(80).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const { routerAPI } = await import("./mikrotik.server");
    const conn = await loadConn(context.supabase, data.routerId);
    const users = await routerAPI.users(conn).catch(() => [] as Array<Record<string, string>>);
    assertNotProtectedHotspotUser(users, data.id);
    const stamp = `redeemed ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    const comment = data.note ? `${stamp} · ${data.note}` : stamp;
    await routerAPI.patchUser(conn, data.id, { comment });
    return { ok: true, comment };
  });

// One-click rollback used by Quick Setup when the reachability/register step fails.
// Connects to the router with the wizard credentials over a public DDNS host
// (never a LAN IP) and runs either the soft rollback script (removes only
// wizard-added artefacts) or a hard restore (loads the pre-setup binary backup;
// router reboots).
export const executeQuickSetupRollback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        host: z.string().min(1).max(200),
        port: z.number().int().min(1).max(65535).default(443),
        username: z.string().min(1).max(80),
        password: z.string().min(1).max(200),
        useTls: z.boolean().default(true),
        apiUser: z.string().min(1).max(80),
        backupTag: z.string().min(1).max(120),
        mode: z.enum(["soft", "hard"]).default("soft"),
        // The wizard installs a self-signed certificate, so the operator has to
        // acknowledge it explicitly; TLS is otherwise verified.
        allowSelfSigned: z.boolean().default(false),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const privateDial = refusePrivateCloudDial(data.host);
    if (privateDial) {
      return { ok: false as const, error: privateDial };
    }
    const { routerAPI } = await import("./mikrotik.server");
    const { assertSafeEndpoint } = await import("./net/endpoint.server");
    await assertSafeEndpoint(data.host, data.port);
    const conn = {
      host: data.host,
      port: data.port,
      username: data.username,
      password: data.password,
      useTls: data.useTls,
      allowInsecureTls: data.allowSelfSigned,
    };
    const softScript = buildQuickSetupSoftRollbackCommands(data.apiUser);
    const hardScript = `/system backup load name=${data.backupTag}`;
    try {
      await routerAPI.execScript(conn, data.mode === "hard" ? hardScript : softScript);
      return {
        ok: true as const,
        mode: data.mode,
        message:
          data.mode === "hard"
            ? "Hard restore issued — the router is rebooting to the pre-setup state."
            : "Soft rollback complete — wizard artefacts removed. DDNS/DNS/identity kept.",
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
