/**
 * Ensure a site UUID belongs to the caller's effective owner (or is null).
 */
import type { DatabaseClient } from "./database.types";

export const SITE_NOT_ON_ACCOUNT =
  "Pick one of your sites (or leave Unassigned). That site is not on your account.";

export async function assertSiteOwnedByTenant(
  supabase: DatabaseClient,
  ownerId: string,
  siteId: string | null | undefined,
): Promise<string | null> {
  if (siteId == null || siteId === "") return null;
  const { data, error } = await supabase
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(SITE_NOT_ON_ACCOUNT);
  return data.id as string;
}

/** Resolve a site for writes: owned UUID, or null if missing/foreign (never throws). */
export async function resolveOwnedSiteId(
  supabase: DatabaseClient,
  ownerId: string,
  siteId: string | null | undefined,
): Promise<string | null> {
  if (siteId == null || siteId === "") return null;
  const { data, error } = await supabase
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}
