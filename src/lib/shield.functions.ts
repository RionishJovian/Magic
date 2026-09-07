import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Internal marker written onto the router so we can find (and cleanly remove)
// only the rules this app manages. Never surfaced in the UI.
const TAG = "mm-login-shield";
const DNS_TAG = `${TAG}-dns`;

export const SHIELD_PARTIAL_WARNING =
  "Partial protection — LAN interface list is missing, so guest DNS bypass is not blocked. Run Magic Hub board prep first.";

type Rule = Record<string, string>;

function shieldRules(): Rule[] {
  return [
    // Tunnel protocols commonly used to escape a captive portal.
    { chain: "forward", protocol: "gre", action: "drop", comment: TAG },
    { chain: "forward", protocol: "ipsec-esp", action: "drop", comment: TAG },
    { chain: "forward", protocol: "ipsec-ah", action: "drop", comment: TAG },
    {
      chain: "forward",
      protocol: "udp",
      "dst-port": "500,1194,1701,4500,51820,1195,1197",
      action: "drop",
      comment: TAG,
    },
    {
      chain: "forward",
      protocol: "tcp",
      "dst-port": "1723,1194,1195,1197,500,4500",
      action: "drop",
      comment: TAG,
    },
    // Encrypted DNS often used to tunnel past the portal's DNS interception.
    { chain: "forward", protocol: "tcp", "dst-port": "853", action: "drop", comment: TAG },
    { chain: "forward", protocol: "udp", "dst-port": "853,784,8853", action: "drop", comment: TAG },
    // Non-router DNS resolvers (requires LAN interface list).
    {
      chain: "forward",
      protocol: "udp",
      "dst-port": "53",
      "in-interface-list": "LAN",
      action: "drop",
      comment: DNS_TAG,
    },
  ];
}

async function conn(supabase: unknown, routerId: string) {
  const { loadRouterConn } = await import("./router-conn.server");
  return loadRouterConn(supabase as never, routerId);
}

async function hasInterfaceList(
  routerAPI: { raw: <T>(c: Awaited<ReturnType<typeof conn>>, path: string) => Promise<T> },
  c: Awaited<ReturnType<typeof conn>>,
  name: string,
): Promise<boolean> {
  const lists = await routerAPI.raw<Array<Record<string, string>>>(c, "/interface/list");
  return (lists ?? []).some((row: Record<string, string>) => (row.name ?? "") === name);
}

function shieldPartial(managed: Rule[], hasLan: boolean): boolean {
  if (managed.length === 0) return false;
  const hasDnsRule = managed.some((r) => (r["comment"] ?? "") === DNS_TAG);
  return !hasLan && !hasDnsRule;
}

export const getShieldStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { routerAPI } = await import("./mikrotik.server");
    try {
      const c = await conn(context.supabase, data.routerId);
      await routerAPI.ping(c);
      const rules = await routerAPI.listFirewallFilter(c);
      const managed = (rules ?? []).filter((r) => (r["comment"] ?? "").startsWith(TAG));
      const hasLan = await hasInterfaceList(routerAPI, c, "LAN");
      const partial = shieldPartial(managed, hasLan);
      return {
        enabled: managed.length > 0,
        partial,
        warning: partial ? SHIELD_PARTIAL_WARNING : null,
        reachable: true,
        error: null as string | null,
      };
    } catch (e) {
      return {
        enabled: false,
        partial: false,
        warning: null as string | null,
        reachable: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

export const setShield = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ routerId: z.string().uuid(), enabled: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const start = performance.now();
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { routerAPI } = await import("./mikrotik.server");
    const { recordShieldOp } = await import("./quick-config-audit.server");

    try {
      const c = await conn(context.supabase, data.routerId);
      await routerAPI.ping(c);

      // Always clear previous managed rules first so toggling is idempotent.
      const existing = await routerAPI.listFirewallFilter(c);
      for (const r of existing ?? []) {
        if ((r["comment"] ?? "").startsWith(TAG) && r[".id"]) {
          await routerAPI.removeFirewallFilter(c, r[".id"]!).catch(() => null);
        }
      }

      if (!data.enabled) {
        await recordShieldOp({
          supabase: context.supabase,
          userId: context.userId,
          routerId: data.routerId,
          enabled: false,
          outcome: "ok",
          durationMs: Math.round(performance.now() - start),
        });
        return { enabled: false, partial: false, warning: null as string | null };
      }

      const hasLan = await hasInterfaceList(routerAPI, c, "LAN");
      let lastError: unknown;

      for (const rule of shieldRules()) {
        if (rule["in-interface-list"] === "LAN" && !hasLan) continue;
        try {
          await routerAPI.addFirewallFilter(c, rule);
        } catch (e) {
          lastError = e;
        }
      }

      const after = await routerAPI.listFirewallFilter(c);
      const managed = (after ?? []).filter((r) => (r["comment"] ?? "").startsWith(TAG));
      if (managed.length === 0) {
        const message =
          lastError instanceof Error
            ? lastError.message
            : "The router rejected the Login Bypass Shield rules.";
        throw new Error(message);
      }

      const partial = shieldPartial(managed, hasLan);
      const warning = partial ? SHIELD_PARTIAL_WARNING : null;
      await recordShieldOp({
        supabase: context.supabase,
        userId: context.userId,
        routerId: data.routerId,
        enabled: true,
        outcome: partial ? "partial" : "ok",
        detail: partial ? `login_bypass_shield → on (partial, no LAN list)` : undefined,
        durationMs: Math.round(performance.now() - start),
      });
      return { enabled: true, partial, warning };
    } catch (e) {
      await recordShieldOp({
        supabase: context.supabase,
        userId: context.userId,
        routerId: data.routerId,
        enabled: data.enabled,
        outcome: "failed",
        error: e,
        durationMs: Math.round(performance.now() - start),
      });
      throw e;
    }
  });
