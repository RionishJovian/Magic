import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Tier } from "./services/entitlements";
import { passwordSchema } from "./password-policy";

function tier(value: string | null | undefined): Tier {
  return value === "monthly" || value === "annual" ? value : "trial";
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [
      { data: profile },
      { data: roles },
      { data: wallet, error: walletError },
      { data: webfigKey, error: webfigKeyError },
      { data: resellerAddKey, error: resellerAddKeyError },
      { data: routerUnlockKey, error: routerUnlockKeyError },
    ] = await Promise.all([
      context.supabase
        .from("profiles")
        .select(
          "id, display_name, username, avatar_url, created_at, display_name_changed_at, language",
        )
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase.from("user_roles").select("role, expires_at").eq("user_id", context.userId),
      context.supabase.rpc("get_magic_coin_wallet"),
      context.supabase.rpc("get_webfig_unlock_key"),
      context.supabase.rpc("get_reseller_add_keys"),
      context.supabase.rpc("get_router_unlock_keys"),
    ]);
    if (walletError) throw new Error(walletError.message);
    if (webfigKeyError) throw new Error(webfigKeyError.message);
    if (resellerAddKeyError) throw new Error(resellerAddKeyError.message);
    if (routerUnlockKeyError) throw new Error(routerUnlockKeyError.message);

    const { data: ent } = await context.supabase
      .from("account_entitlements")
      .select("tier, tier_expires_at, plus")
      .eq("user_id", context.userId)
      .maybeSingle();

    const roleRows = (roles ?? []) as { role: string; expires_at: string | null }[];
    const clientRow = roleRows.find((r) => r.role === "client");

    const { isPlatformAdminUser } = await import("./guards.server");
    const isPlatformAdmin = await isPlatformAdminUser(context.supabase, context.userId);

    const { accountStatus } = await import("./services/entitlements");
    const roleNames = roleRows.map((r) => r.role);
    const status = accountStatus({
      roles: roleNames,
      entitlement: {
        tier: tier(ent?.tier),
        tier_expires_at: ent?.tier_expires_at ?? clientRow?.expires_at ?? null,
        plus: Boolean(ent?.plus),
      },
      created_at: profile?.created_at ?? null,
      isPlatformAdmin,
    });

    return {
      id: context.userId,
      email: (context.claims as { email?: string })?.email ?? null,
      display_name: profile?.display_name ?? null,
      username: profile?.username ?? null,
      created_at: profile?.created_at ?? null,
      display_name_changed_at: profile?.display_name_changed_at ?? null,
      language: (profile as { language?: string } | null)?.language ?? "en",
      roles: roleRows.map((r) => r.role),
      isPlatformAdmin,
      expires_at: status.tier_expires_at ?? clientRow?.expires_at ?? null,
      account: status,
      wallet: wallet as {
        balance: number;
        mmk_value: number;
        transactions: Array<{
          delta: number;
          balance_after: number;
          kind: string;
          note: string;
          created_at: string;
        }>;
      },
      webfig_key: webfigKey as {
        key_id: number;
        name: string;
        price_coins: number;
        valid_hours: number;
        attributes: string;
        account_bound: boolean;
        non_transferable: boolean;
        active: boolean;
        expires_at: string | null;
      },
      reseller_add_key: resellerAddKey as {
        key_id: number;
        name: string;
        price_coins: number;
        valid_days: number;
        attributes: string;
        account_bound: boolean;
        non_transferable: boolean;
        active_count: number;
        expires_at: string | null;
      },
      router_unlock_key: routerUnlockKey as {
        key_id: number;
        name: string;
        price_coins: number;
        valid_days: number;
        attributes: string;
        account_bound: boolean;
        non_transferable: boolean;
        unique_router_key: boolean;
        active_count: number;
        expires_at: string | null;
      },
    };
  });

/** Buy the account-bound 12-hour WebFig unlock key from the authenticated wallet. */
export const purchaseWebfigUnlockKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("purchase_webfig_unlock_key");
    if (error) {
      if (error.message.includes("INSUFFICIENT_MAGIC_COINS")) {
        throw new Error("You need at least 5 Magic Coins to unlock WebFig for 12 hours.");
      }
      if (error.message.includes("WEBFIG_KEY_ALREADY_ACTIVE")) {
        throw new Error("Your WebFig key is already active.");
      }
      if (error.message.includes("WEBFIG_KEY_NOT_REQUIRED")) {
        throw new Error("This account already has WebFig access and does not need a key.");
      }
      throw new Error(error.message);
    }
    return data as {
      ok: true;
      key_id: number;
      price_coins: number;
      balance: number;
      expires_at: string;
    };
  });

/** Buy one account-bound, single-use Add reseller key from the authenticated wallet. */
export const purchaseResellerAddKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("purchase_reseller_add_key");
    if (error) {
      if (error.message.includes("INSUFFICIENT_MAGIC_COINS")) {
        throw new Error("You need at least 5 Magic Coins to purchase one Add reseller key.");
      }
      if (error.message.includes("RESELLER_ADD_KEY_NOT_REQUIRED")) {
        throw new Error("This account already has Add reseller access and does not need a key.");
      }
      throw new Error(error.message);
    }
    return data as {
      ok: true;
      key_id: number;
      price_coins: number;
      balance: number;
      expires_at: string;
    };
  });

/** Buy one account-bound Router key. It is charged only when an extra router is created. */
export const purchaseRouterUnlockKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("purchase_router_unlock_key");
    if (error) {
      if (error.message.includes("INSUFFICIENT_MAGIC_COINS"))
        throw new Error("You need at least 30 Magic Coins to purchase one Router key.");
      if (error.message.includes("ROUTER_KEY_ALREADY_READY"))
        throw new Error(
          "A Router key is already ready. Create or re-unlock one router with it first.",
        );
      if (error.message.includes("ROUTER_KEY_NOT_REQUIRED"))
        throw new Error("This account already has router access and does not need a Router key.");
      throw new Error(error.message);
    }
    return data as {
      ok: true;
      key_id: number;
      price_coins: number;
      balance: number;
      expires_at: string;
    };
  });

/** Persist the account-level UI language so it follows the user across devices. */
export const updateLanguage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ language: z.enum(["en", "zh", "my"]) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ language: data.language })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, language: data.language };
  });

export const updateDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ display_name: z.string().trim().min(2).max(60) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: readErr } = await context.supabase
      .from("profiles")
      .select("display_name_changed_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (existing?.display_name_changed_at) {
      throw new Error("Display name already changed — contact the app owner to change it again.");
    }

    const { error } = await context.supabase
      .from("profiles")
      .update({
        display_name: data.display_name,
        display_name_changed_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    return { ok: true, display_name: data.display_name };
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        current_password: z.string().min(1).max(200),
        new_password: passwordSchema(200),
        confirm_password: passwordSchema(200),
      })
      .refine((v) => v.new_password === v.confirm_password, {
        message: "New password and confirmation do not match.",
      })
      .refine((v) => v.new_password !== v.current_password, {
        message: "The new password must be different from the current one.",
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims as { email?: string })?.email;
    if (!email) throw new Error("This account has no email on file.");

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const verifier = createClient(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { error: signInErr } = await verifier.auth.signInWithPassword({
      email,
      password: data.current_password,
    });
    if (signInErr) throw new Error("Current password is incorrect.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.new_password,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });
