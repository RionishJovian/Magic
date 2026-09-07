/**
 * Resolve `user_roles.owner_id` for Users & roles workflows.
 *
 * Role meanings:
 * - User (`client`): café shop owner who runs their own RouterBOARD Hotspot business.
 * - Primary: Application owner (producer of the app) — does not own a café.
 * - Developer: builds application features — does not own a café.
 * - Verified Agent: hired by the Application owner to recruit café Users; earns
 *   Magic Coins commission on monthly/annual purchases from Users tagged under
 *   their agent id (`account_referrals.agent_id`).
 *
 * Product rules:
 * 1. One Primary per cloud — creating/granting a second Primary is blocked
 *    (`assertSingleCafePrimary`).
 * 2. `user_roles.owner_id` records the direct parent/creator for newly created
 *    accounts. Primary/Developer-created accounts point to the caller; Agent-created
 *    accounts point to the Agent.
 * 3. Direct parentage is not operational tenancy. Client data remains self-scoped
 *    through `effective_owner()`, so an Agent cannot control a recruited User.
 * 4. Developer and Primary authority is granted by platform role/scope, not by
 *    rewriting a User's direct parent.
 * 5. Verified Agent → new User: `account_referrals.agent_id` remains the source of
 *    referral attribution and Magic Coins commission.
 */
import { TENANT_PRIMARY_ROLE } from "./app-role";
import type { AdminScope } from "./admin-scope.server";

const SELF_OWNED_ROLES = new Set(["client", "agent", "expired", "pending"]);

export function resolveUserRoleOwnerId(input: {
  role: string;
  subjectUserId: string;
  scope: Pick<AdminScope, "tenantId" | "isPlatformAdmin">;
  /** @deprecated Ignored for User/Agent — direct parent comes from scope. */
  tenantPrimaryId?: string | null;
  /** @deprecated Ignored for direct-parent assignment. */
  existingOwnerId?: string | null;
}): string {
  // Primary is self-owned (the one Application-owner row — not a café).
  if (input.role === TENANT_PRIMARY_ROLE) {
    return input.subjectUserId;
  }

  // For child accounts, owner_id is the direct parent/creator. The caller's
  // scope user is authoritative; tenantPrimaryId remains deprecated and ignored.
  if (SELF_OWNED_ROLES.has(input.role)) {
    return input.scope.tenantId;
  }

  // Fallback: unknown role → self-own (safe isolation).
  return input.subjectUserId;
}

/** True when this role's operational data is isolated to its own account. */
export function roleIsSelfOwned(role: string): boolean {
  return role === TENANT_PRIMARY_ROLE || SELF_OWNED_ROLES.has(role);
}

/** Service-role check that a user id actually holds the primary role. */
export async function assertUserIsTenantPrimary(primaryUserId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", primaryUserId)
    .eq("role", TENANT_PRIMARY_ROLE)
    .maybeSingle();
  if (!data) {
    throw new Error("That account is not a Primary tenant.");
  }
}

/**
 * One Primary (app owner) per cloud project.
 * Blocks creating or granting a second Primary.
 */
export async function assertSingleCafePrimary(subjectUserId?: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin.from("user_roles").select("user_id").eq("role", TENANT_PRIMARY_ROLE);
  if (subjectUserId) {
    q = q.neq("user_id", subjectUserId);
  }
  const { data, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  if ((data ?? []).length > 0) {
    throw new Error(
      "This platform already has a Primary (app owner). Users (café owners) and Agents own their own accounts — create those roles instead of another Primary.",
    );
  }
}
