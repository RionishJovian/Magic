// Server-only tenant authorization for WireGuard peer lifecycle operations.
//
// Mirrors the SQL helper can_manage_router_tenant(): platform_admins keep
// global oversight; everybody else (including café owner/admin) must be a
// non-expired member of the same effective tenant as the router they act on.
//
// Fail-closed: the router is fetched FIRST and any database/query error, or an
// unknown router, denies everybody — including platform admins.

import type { DatabaseClient } from "../database.types";
import { getRoles, effectiveOwner } from "../guards.server";

export const ROUTER_TENANT_DENIED = "You don't have access to this router.";
export const ROUTER_TENANT_EXPIRED =
  "Your account has expired. Reactivate it to manage router connections.";
export const ROUTER_LOOKUP_FAILED =
  "This router could not be verified right now. Try again in a moment.";

export type RouterTenantDecision =
  | { allowed: true; reason: "platform_oversight" | "same_tenant" }
  | { allowed: false; reason: "expired" | "cross_tenant" | "unknown_router" | "lookup_failed" };

/** Pure decision used by both the runtime guard and the tests. */
export function decideRouterTenantAccess(input: {
  roles: string[];
  expired: boolean;
  callerTenantId: string | null;
  routerOwnerId: string | null;
  lookupFailed?: boolean;
  /** Explicit platform_admins membership — not café owner/admin. */
  isPlatformAdmin?: boolean;
}): RouterTenantDecision {
  // Router existence is proven before any role can grant access.
  if (input.lookupFailed) return { allowed: false, reason: "lookup_failed" };
  if (!input.routerOwnerId) return { allowed: false, reason: "unknown_router" };
  if (input.isPlatformAdmin) return { allowed: true, reason: "platform_oversight" };
  if (input.callerTenantId !== input.routerOwnerId)
    return { allowed: false, reason: "cross_tenant" };
  if (input.expired) return { allowed: false, reason: "expired" };
  return { allowed: true, reason: "same_tenant" };
}

export function messageFor(decision: RouterTenantDecision): string {
  if (decision.allowed) return "";
  if (decision.reason === "expired") return ROUTER_TENANT_EXPIRED;
  if (decision.reason === "lookup_failed") return ROUTER_LOOKUP_FAILED;
  return ROUTER_TENANT_DENIED;
}

export type RouterTenantContext = {
  routerId: string;
  ownerId: string;
  routerName: string | null;
  privileged: boolean;
};

export type RouterTenantAuditEntry = {
  action: "wg_peer_authz_failed";
  outcome: "blocked" | "failed";
  reason: "expired" | "cross_tenant" | "unknown_router" | "lookup_failed";
  routerId: string;
};

async function isPlatformAdminUser(supabase: DatabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_platform_admin", { _user_id: userId });
    if (!error && typeof data === "boolean") return data;
  } catch {
    // fall through to table lookup
  }
  try {
    const { data } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data?.user_id);
  } catch {
    return false;
  }
}

/**
 * Loads the router with the caller's own RLS-scoped client and authorizes it.
 * Never trusts an owner id supplied by the browser.
 */
export async function requireRouterTenantAccess(
  supabase: DatabaseClient,
  userId: string,
  routerId: string,
  audit?: (entry: RouterTenantAuditEntry) => Promise<void> | void,
): Promise<RouterTenantContext> {
  let routerOwnerId: string | null = null;
  let routerName: string | null = null;
  let lookupFailed = false;

  try {
    const { data, error } = await supabase
      .from("router_connections")
      .select("id, owner_id, name")
      .eq("id", routerId)
      .maybeSingle();
    if (error) lookupFailed = true;
    else {
      routerOwnerId = ((data as { owner_id?: string } | null)?.owner_id as string) ?? null;
      routerName = ((data as { name?: string } | null)?.name as string) ?? null;
    }
  } catch {
    lookupFailed = true;
  }

  let roles: string[] = [];
  let callerTenantId: string | null = null;
  let platformAdmin = false;
  if (!lookupFailed && routerOwnerId) {
    try {
      roles = await getRoles(supabase, userId);
      platformAdmin = await isPlatformAdminUser(supabase, userId);
      // Café owner/admin still resolve to their tenant; only platform admins skip.
      callerTenantId = platformAdmin ? null : await effectiveOwner(supabase, userId);
    } catch {
      lookupFailed = true;
    }
  }

  const decision = decideRouterTenantAccess({
    roles,
    expired: roles.includes("expired") || roles.includes("pending"),
    callerTenantId,
    routerOwnerId,
    lookupFailed,
    isPlatformAdmin: platformAdmin,
  });

  if (!decision.allowed) {
    await audit?.({
      action: "wg_peer_authz_failed",
      outcome: decision.reason === "lookup_failed" ? "failed" : "blocked",
      reason: decision.reason,
      routerId,
    });
    throw new Error(messageFor(decision));
  }

  return {
    routerId,
    ownerId: routerOwnerId as string,
    routerName,
    privileged: platformAdmin,
  };
}
