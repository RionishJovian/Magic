import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DatabaseClient } from "./database.types";
import { MAGIC_DUDE_LOCKED_REASON, canUseMagicDude } from "./magic-dude-access";
import { accountStatus, type Tier } from "./services/entitlements";
import { magicDudeRosGuide } from "./magic-dude-ros-knowledge";

const safeCheckInput = z.object({
  routerId: z.string().uuid(),
  topic: z.enum(["guests", "voucher", "router"]),
});

type SupportTopic = z.infer<typeof safeCheckInput>["topic"];
type CheckLevel = "ok" | "warn" | "block";

export async function getMagicDudeAccess(context: { supabase: DatabaseClient; userId: string }) {
  const { getRoles, isPlatformAdminUser } = await import("./guards.server");
  const [roles, isPlatformAdmin, profileResult, entitlementResult, clientRoleResult] =
    await Promise.all([
      getRoles(context.supabase, context.userId),
      isPlatformAdminUser(context.supabase, context.userId),
      context.supabase.from("profiles").select("created_at").eq("id", context.userId).maybeSingle(),
      context.supabase
        .from("account_entitlements")
        .select("tier, tier_expires_at")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("user_roles")
        .select("expires_at")
        .eq("user_id", context.userId)
        .eq("role", "client")
        .maybeSingle(),
    ]);
  const entitlement = entitlementResult.data;
  const account = accountStatus({
    roles,
    entitlement: {
      tier: (entitlement?.tier === "monthly" || entitlement?.tier === "annual"
        ? entitlement.tier
        : "trial") as Tier,
      tier_expires_at: entitlement?.tier_expires_at ?? clientRoleResult.data?.expires_at ?? null,
      plus: false,
    },
    created_at: profileResult.data?.created_at ?? null,
    isPlatformAdmin,
  });
  if (canUseMagicDude(roles, isPlatformAdmin, account.trial))
    return {
      allowed: true,
      staffExempt: true,
      purchaseEligible: false,
      balance: null as number | null,
      expiresAt: null as string | null,
    };
  const purchaseEligible = roles.includes("client") && !account.trial && !account.expired;
  if (!purchaseEligible)
    return {
      allowed: false,
      staffExempt: false,
      purchaseEligible: false,
      balance: null as number | null,
      expiresAt: null as string | null,
    };
  const [{ data: hasUnlock, error }, { data: unlock }, { data: wallet, error: walletError }] =
    await Promise.all([
      context.supabase.rpc("has_active_magic_dude_unlock"),
      context.supabase.rpc("get_magic_dude_unlock"),
      context.supabase.rpc("get_magic_coin_wallet"),
    ]);
  if (error) throw new Error(`Could not verify the Magic Dude unlock: ${error.message}`);
  if (walletError) throw new Error(`Could not verify your Magic Coin balance: ${walletError.message}`);
  const key = unlock as { expires_at?: string | null } | null;
  const walletData = wallet as { balance?: number | null } | null;
  return {
    allowed: hasUnlock === true,
    staffExempt: false,
    purchaseEligible: true,
    balance: Number(walletData?.balance ?? 0),
    expiresAt: key?.expires_at ?? null,
  };
}

export async function requireMagicDudeAccess(context: { supabase: DatabaseClient; userId: string }) {
  const access = await getMagicDudeAccess(context);
  if (!access.allowed) throw new Error(MAGIC_DUDE_LOCKED_REASON);
  return access;
}

export const getMagicDudeUnlockAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => getMagicDudeAccess(context));

export const purchaseMagicDudeUnlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // The server-side RPC consumes 5 coins and grants the activation for 30 days atomically.
    const { data, error } = await context.supabase.rpc("purchase_magic_dude_unlock");
    if (error) {
      if (error.message.includes("INSUFFICIENT_MAGIC_COINS"))
        throw new Error("You don't have sufficient coins");
      if (error.message.includes("MAGIC_DUDE_UNLOCK_ALREADY_ACTIVE"))
        throw new Error("Magic Dude is already unlocked on this account.");
      if (error.message.includes("MAGIC_DUDE_UNLOCK_NOT_REQUIRED"))
        throw new Error("This account already has Magic Dude access.");
      if (error.message.includes("MAGIC_DUDE_ACTIVE_USER_REQUIRED"))
        throw new Error("An active User account is required to unlock Magic Dude.");
      throw new Error(error.message);
    }
    return data as { ok: true; price_coins: number; balance: number; expires_at: string };
  });

function nextStep(topic: SupportTopic, level: CheckLevel) {
  if (topic === "guests") {
    return level === "ok"
      ? { label: "Open Vouchers", to: "/app/vouchers" }
      : { label: "Open Hotspot Wi-Fi", to: "/app/routers" };
  }
  if (topic === "voucher") {
    return level === "ok"
      ? { label: "Open Vouchers", to: "/app/vouchers" }
      : { label: "Open Vouchers", to: "/app/vouchers" };
  }
  return { label: "Open Routers", to: "/app/routers" };
}

/**
 * Read-only customer support diagnosis. It never writes RouterOS state; the
 * sole write is a secret-free audit record proving that the safe check ran.
 */
export const runMagicDudeSafeCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => safeCheckInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { effectiveOwner } = await import("./guards.server");
    await requireMagicDudeAccess(context);
    const ownerId = await effectiveOwner(context.supabase, context.userId);
    const { data: router, error: routerError } = await context.supabase
      .from("router_connections")
      .select("id, name")
      .eq("id", data.routerId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (routerError) throw new Error(routerError.message);
    if (!router) throw new Error("Router not found in your account.");

    const [{ data: codes, error: codesError }, { data: latestDeploy, error: deployError }] =
      await Promise.all([
        context.supabase
          .from("voucher_codes")
          .select("status")
          .eq("owner_id", ownerId)
          .eq("router_id", data.routerId)
          .neq("status", "cancelled"),
        context.supabase
          .from("portal_deploy_audit")
          .select("ok, error, created_at")
          .eq("owner_id", ownerId)
          .eq("router_id", data.routerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    if (codesError) throw new Error(codesError.message);
    if (deployError) throw new Error(deployError.message);

    const countByStatus = (codes ?? []).reduce<Record<string, number>>((counts, code) => {
      const status = String(code.status ?? "unknown");
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});

    const started = performance.now();
    let level: CheckLevel = "ok";
    let title = "Router support check completed";
    let summary = "The router answered the read-only Hotspot check.";
    let evidence: string[] = [];
    try {
      const { loadRouterConn } = await import("./router-conn.server");
      const { assessHotspotGuestReady, probeWifiHotspot } = await import("./wifi-hotspot.server");
      const readiness = assessHotspotGuestReady(
        await probeWifiHotspot(await loadRouterConn(context.supabase, router.id)),
      );
      level = readiness.level;
      evidence = [
        readiness.summary,
        `Voucher ledger: ${codes?.length ?? 0} active-record code(s) on this router.`,
        latestDeploy
          ? `Latest portal deploy: ${latestDeploy.ok ? "succeeded" : "failed"} (${new Date(latestDeploy.created_at).toLocaleString()}).`
          : "No portal deployment is recorded for this router yet.",
      ];
      if (data.topic === "guests") {
        title =
          readiness.level === "ok" ? "Guest Wi-Fi is ready" : "Guests may not be able to join";
        summary = readiness.summary;
      } else if (data.topic === "voucher") {
        if ((codes?.length ?? 0) === 0) {
          level = "warn";
          title = "No app-tracked vouchers found";
          summary =
            "Create vouchers in MikroTik Magic, or use the audited legacy import for existing router-only codes.";
        } else if (readiness.level === "block") {
          title = "Voucher login is blocked by Hotspot setup";
          summary = readiness.summary;
        } else {
          title = "Voucher check completed";
          summary = `${codes?.length ?? 0} voucher code(s) are tracked for this router. ${readiness.summary}`;
        }
      } else if (!readiness.reachable) {
        title = "Router cannot be reached";
        summary = readiness.summary;
      } else {
        title = "Router is reachable";
        summary = readiness.summary;
      }
    } catch (error) {
      level = "block";
      title = "Safe check could not reach the router";
      summary =
        error instanceof Error ? error.message : "The router did not return a safe response.";
      evidence = [
        "No router configuration was changed.",
        `Voucher ledger: ${codes?.length ?? 0} active-record code(s) on this router.`,
        latestDeploy
          ? `Latest portal deploy: ${latestDeploy.ok ? "succeeded" : "failed"}.`
          : "No portal deployment is recorded yet.",
      ];
    }

    const { recordRouterOp } = await import("./audit.server");
    await recordRouterOp({
      userId: context.userId,
      ownerId,
      routerId: router.id,
      routerName: router.name,
      action: "magic_dude_safe_check",
      outcome: level === "block" ? "blocked" : level === "warn" ? "partial" : "ok",
      detail: `${data.topic}: ${title}`,
      durationMs: performance.now() - started,
    });

    return {
      checkedAt: new Date().toISOString(),
      routerName: router.name,
      topic: data.topic,
      level,
      title,
      summary,
      evidence,
      voucherCounts: countByStatus,
      rosGuide: magicDudeRosGuide(data.topic),
      next: nextStep(data.topic, level),
    };
 
    
  });
