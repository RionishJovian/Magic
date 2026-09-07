/**
 * Tenant-issued, time-limited delegation that lets a named support account act on ONE router.
 *
 * Platform Support scope alone never grants a cross-tenant write: the customer must explicitly
 * hand out a grant for a specific router, a specific action, and a specific expiry. Grants are
 * revocable at any time and are always re-checked at call time (never cached).
 */
import type { DatabaseClient } from "./database.types";

export const SUPPORT_GRANT_ACTIONS = ["sync_plans"] as const;
export type SupportGrantAction = (typeof SUPPORT_GRANT_ACTIONS)[number];

export const SUPPORT_GRANT_ACTION_LABELS: Record<SupportGrantAction, string> = {
  sync_plans: "Sync voucher plans (add-only)",
};

/** Hard ceiling so a grant can never become permanent standing access. */
export const SUPPORT_GRANT_MAX_HOURS = 72;

export type SupportGrantRow = {
  id: string;
  owner_id: string;
  router_id: string;
  grantee_user_id: string;
  actions: string[];
  reason: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export function isGrantActive(grant: Pick<SupportGrantRow, "revoked_at" | "expires_at">): boolean {
  if (grant.revoked_at) return false;
  return new Date(grant.expires_at).getTime() > Date.now();
}

/**
 * Throws unless the caller currently holds an active grant for this router + action.
 * Read with the service role so the check does not depend on the caller's own RLS view.
 */
export async function assertActiveSupportGrant(
  routerId: string,
  granteeUserId: string,
  action: SupportGrantAction,
): Promise<SupportGrantRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("router_support_grants")
    .select("id, owner_id, router_id, grantee_user_id, actions, reason, expires_at, revoked_at, created_at")
    .eq("router_id", routerId)
    .eq("grantee_user_id", granteeUserId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const grant = (data ?? []).find((row) =>
    ((row as SupportGrantRow).actions ?? []).includes(action),
  ) as SupportGrantRow | undefined;
  if (!grant) {
    throw new Error(
      "The account owner has not granted you permission for this action on this router. Ask them to open Router support access and issue a time-limited grant.",
    );
  }
  return grant;
}

/** Grants visible to a tenant (their own routers), newest first. */
export async function listGrantsForOwner(ownerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("router_support_grants")
    .select(
      "id, owner_id, router_id, grantee_user_id, actions, reason, expires_at, revoked_at, created_at",
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as SupportGrantRow[];
}

/** Display names for the support accounts a tenant may delegate to (platform admins only). */
export async function listSupportAccounts(): Promise<
  Array<{ userId: string; label: string }>
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admins, error } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id, note");
  if (error) throw new Error(error.message);
  const ids = (admins ?? []).map((row) => row.user_id as string);
  if (!ids.length) return [];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, username")
    .in("id", ids);
  const byId = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      ((p.display_name as string | null) ?? (p.username as string | null) ?? "").trim(),
    ]),
  );
  return ids.map((userId) => ({
    userId,
    label: byId.get(userId) || `Support account ${userId.slice(0, 8)}`,
  }));
}

/** True when the target user is an approved platform support account. */
export async function isSupportAccount(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Effective tenant owner for a caller, using their own RLS-scoped client. */
export async function effectiveOwnerId(supabase: DatabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("effective_owner", { _user_id: userId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? userId;
}
