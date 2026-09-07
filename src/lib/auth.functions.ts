import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { accountStatus, type Tier } from "./services/entitlements";

function isNewKey(v: string) {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}
function supaFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

// Public server fn: returns null when there's no valid session instead of
// throwing 401. The `_authenticated` route gate is what actually redirects
// unauthenticated users; this avoids a runtime error whenever a component
// query races an expired/absent session.
export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const authHeader = req?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token || token.split(".").length !== 3) return null;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const supabase = createClient<Database>(url, key, {
    global: { fetch: supaFetch(key), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  const userId = data.claims.sub;

  const [{ data: profile }, { data: roles }, { data: platformAdmin }, { data: entitlement }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url, created_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role, expires_at").eq("user_id", userId),
      // RLS: users may only see their own platform_admins row.
      supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
      supabase
        .from("account_entitlements")
        .select("tier, plus, tier_expires_at")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
  const roleRows = (roles ?? []) as { role: string; expires_at: string | null }[];
  const clientRow = roleRows.find((r) => r.role === "client");
  const roleList = roleRows.map((r) => r.role);
  const isPlatformAdmin = Boolean(platformAdmin);
  // Kept for old clients while the retired add-on is removed from all gates.
  const hasActivePlus = false;
  const account = accountStatus({
    roles: roleList,
    entitlement: {
      tier: (entitlement?.tier === "monthly" || entitlement?.tier === "annual"
        ? entitlement.tier
        : "trial") as Tier,
      tier_expires_at: entitlement?.tier_expires_at ?? clientRow?.expires_at ?? null,
      plus: false,
    },
    created_at: profile?.created_at ?? null,
    isPlatformAdmin,
  });
  let features: string[] = [];
  try {
    const { loadResolvedFeatures } = await import("@/lib/operator-grants.functions");
    features = await loadResolvedFeatures(supabase, userId, roleList, isPlatformAdmin);
  } catch {
    // Missing grant tables or a broken list_features RPC must not crash the shell.
    features = [];
  }
  return {
    id: userId,
    email: (data.claims as { email?: string })?.email ?? null,
    profile: profile ?? null,
    roles: roleList,
    features,
    client_expires_at: clientRow?.expires_at ?? null,
    has_active_plus: hasActivePlus,
    account,
    /** Cross-tenant platform operator — not the café `owner` role. */
    isPlatformAdmin,
  };
});
