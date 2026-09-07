// Tenant-scoped admin authorization for user-management server functions.
//
// A plain `has_role(uid,'owner')` check is NOT sufficient: every business owner
// holds the `owner` role inside their own tenant, so an unscoped check let any
// owner manage accounts belonging to unrelated tenants. Cross-tenant power is
// now limited to explicitly listed platform administrators.
import { TENANT_PRIMARY_ROLE } from "./app-role";
import type { DatabaseClient } from "./database.types";

export type AdminScope = {
  userId: string;
  tenantId: string;
  isPlatformAdmin: boolean;
};

export async function resolveAdminScope(ctx: {
  supabase: DatabaseClient;
  userId: string;
}): Promise<AdminScope> {
  const [{ data: isOwner }, isPlatformAdmin] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: TENANT_PRIMARY_ROLE }),
    (async () => {
      const { isPlatformAdminUser } = await import("./guards.server");
      return isPlatformAdminUser(ctx.supabase, ctx.userId);
    })(),
  ]);
  if (!isOwner && !isPlatformAdmin) throw new Error("Forbidden: primary tenant user only");

  const { data: owner } = await ctx.supabase.rpc("effective_owner", { _user_id: ctx.userId });

  return {
    userId: ctx.userId,
    tenantId: (owner as string | null) ?? ctx.userId,
    isPlatformAdmin,
  };
}

/** Platform-wide operations (global backups, all-tenant listings). */
export async function requirePlatformAdmin(ctx: {
  supabase: DatabaseClient;
  userId: string;
}): Promise<AdminScope> {
  const scope = await resolveAdminScope(ctx);
  if (!scope.isPlatformAdmin) {
    throw new Error("Forbidden: Dev only");
  }
  return scope;
}

/** Tenant id that a target account belongs to, resolved with service role. */
export async function tenantOfUser(targetUserId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("owner_id")
    .eq("user_id", targetUserId)
    .not("owner_id", "is", null)
    .limit(1)
    .maybeSingle();
  return (data?.owner_id as string | null) ?? null;
}

/**
 * Reject mutating another account outside what this admin may manage.
 * - Developer: any account
 * - Primary (Application owner — does not own a café): any User / Agent / Expired /
 *   Pending (self-owned café accounts on this cloud). Cannot manage another Primary (see
 *   `assertCanManagePrimaryAccount`).
 */
export async function assertTargetInScope(scope: AdminScope, targetUserId: string): Promise<void> {
  if (scope.isPlatformAdmin) return;
  if (targetUserId === scope.userId) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("user_roles")
    .select("role, owner_id")
    .eq("user_id", targetUserId);
  const roles = (rows ?? []).map((r) => r.role as string);
  if (roles.includes(TENANT_PRIMARY_ROLE)) {
    throw new Error("Forbidden: only a Developer can manage another Primary account.");
  }
  // Self-owned User/Agent (or legacy rows still under this Primary).
  const manageable = roles.some((r) => ["client", "agent", "expired", "pending"].includes(r));
  if (manageable) return;

  const targetTenant = (rows ?? []).find((r) => r.owner_id)?.owner_id ?? null;
  if (targetTenant && targetTenant === scope.tenantId) return;

  throw new Error("Forbidden: that account is outside your management scope.");
}

/** Reject mutating another tenant's Primary row unless caller is Developer. */
export async function assertCanManagePrimaryAccount(
  scope: AdminScope,
  targetUserId: string,
): Promise<void> {
  if (scope.isPlatformAdmin || targetUserId === scope.userId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .eq("role", TENANT_PRIMARY_ROLE)
    .maybeSingle();
  if (data) {
    throw new Error("Forbidden: only a Developer can manage another Primary account.");
  }
}

/** Filter rows keyed by user_id down to the caller's tenant. `null` allowed = all. */
export function filterByUserIdSet<T extends { user_id: string }>(
  rows: T[],
  allowed: Set<string> | null,
): T[] {
  if (!allowed) return rows;
  return rows.filter((r) => allowed.has(r.user_id));
}

/**
 * User ids this admin may manage.
 * - Developer: `null` (no filter — platform-wide).
 * - Primary (Application owner): every café User / Agent / Expired / Pending on the
 *   cloud (direct parentage does not limit platform authority) plus self.
 */
export async function tenantUserIdSet(scope: AdminScope): Promise<Set<string> | null> {
  if (scope.isPlatformAdmin) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role, owner_id")
    .in("role", ["client", "agent", "expired", "pending", TENANT_PRIMARY_ROLE]);
  const ids = new Set<string>([scope.userId, scope.tenantId]);
  for (const row of data ?? []) {
    const role = row.role as string;
    if (["client", "agent", "expired", "pending"].includes(role)) {
      ids.add(row.user_id);
      continue;
    }
    // Legacy under-Primary rows + own Primary row.
    if (row.owner_id === scope.tenantId || row.user_id === scope.userId) {
      ids.add(row.user_id);
    }
  }
  return ids;
}

/** Filter a list of user ids down to the caller's management scope. */
export function scopeUserIds(
  scope: AdminScope,
  rows: Array<{ user_id: string; owner_id: string | null; role?: string }>,
): Set<string> {
  const ids = new Set<string>([scope.userId]);
  for (const r of rows) {
    if (scope.isPlatformAdmin) {
      ids.add(r.user_id);
      continue;
    }
    const role = r.role ?? "";
    if (["client", "agent", "expired", "pending"].includes(role)) {
      ids.add(r.user_id);
      continue;
    }
    if (r.owner_id === scope.tenantId) ids.add(r.user_id);
  }
  return ids;
}
