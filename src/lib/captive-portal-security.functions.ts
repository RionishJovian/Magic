import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  evaluateCaptivePortalSecurity,
  generatePreAuthGuardPlan,
  normalizeSnapshotValue,
  type RouterSnapshot,
} from "./captive-portal-security.server";

const READS = {
  systemResource: "/system/resource",
  firewallFilter: "/ip/firewall/filter",
  nat: "/ip/firewall/nat",
  interfaces: "/interface",
  interfaceLists: "/interface/list",
  interfaceListMembers: "/interface/list/member",
  hotspotProfiles: "/ip/hotspot/profile",
  hotspotServers: "/ip/hotspot",
  hotspotUsers: "/ip/hotspot/user",
  activeUsers: "/ip/hotspot/active",
  bindings: "/ip/hotspot/ip-binding",
  walledGarden: "/ip/hotspot/walled-garden",
  walledGardenIp: "/ip/hotspot/walled-garden/ip",
  dns: "/ip/dns",
  dhcpServers: "/ip/dhcp-server",
  dhcpNetworks: "/ip/dhcp-server/network",
  addresses: "/ip/address",
  ipv6Filter: "/ipv6/firewall/filter",
  ipv6Addresses: "/ipv6/address",
  ipv6Nd: "/ipv6/nd",
} as const;

export const getCaptivePortalSecurityHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { loadRouterConn } = await import("./router-conn.server");
    const { routerAPI } = await import("./mikrotik.server");
    const snapshot: RouterSnapshot = { errors: {} };
    let conn;
    try {
      conn = await loadRouterConn(context.supabase, data.routerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const key of Object.keys(READS)) snapshot.errors![key] = message;
      return {
        health: evaluateCaptivePortalSecurity(snapshot),
        preAuthGuard: generatePreAuthGuardPlan(snapshot),
      };
    }
    await Promise.all(
      Object.entries(READS).map(async ([key, path]) => {
        try {
          snapshot[key] = normalizeSnapshotValue(await routerAPI.raw(conn, path));
        } catch (error) {
          snapshot.errors![key] = error instanceof Error ? error.message : String(error);
        }
      }),
    );
    return {
      health: evaluateCaptivePortalSecurity(snapshot),
      preAuthGuard: generatePreAuthGuardPlan(snapshot),
    };
  });
