import type { DatabaseClient } from "./database.types";

/** Refuses all router transport actions once the paid router key expires. */
export async function assertRouterUnlockActive(
  supabase: DatabaseClient,
  routerId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("router_unlock_key_accessible", {
    _router_id: routerId,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "This router is locked because its Router key expired. Buy a Router key and re-unlock this router.",
    );
  }
}

type OwnerAccessRpc = (
  functionName: string,
  args: { _router_id: string; _owner_id: string },
) => Promise<{ data: boolean | null; error: { message: string } | null }>;

/**
 * Scheduled jobs use the service-role client, so auth.uid() is intentionally
 * empty. This keeps the expiry rule fail-closed while allowing a cron handler
 * that already verified CRON_SECRET to evaluate one router for its tenant.
 */
export async function assertRouterUnlockActiveForOwner(
  supabase: DatabaseClient,
  routerId: string,
  ownerId: string,
): Promise<void> {
  const rpc = supabase.rpc as unknown as OwnerAccessRpc;
  const { data, error } = await rpc("router_unlock_key_accessible_for_owner", {
    _router_id: routerId,
    _owner_id: ownerId,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "This router is locked because its Router key expired. Buy a Router key and re-unlock this router.",
    );
  }
}
