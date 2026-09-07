/**
 * Audited cross-tenant RouterOS support operations for Primary and Developer.
 *
 * This intentionally exposes neither credentials nor a generic terminal. Reads are audited;
 * the single write operation is a reasoned, typed-confirmation reboot.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const routerIdSchema = z.object({ routerId: z.string().uuid() });
export const BASIC_DEFAULT_SUPPORT_ACTIONS = ["sync_plans"] as const;
type BasicDefaultSupportAction = (typeof BASIC_DEFAULT_SUPPORT_ACTIONS)[number];

type SupportRouterRow = {
  id: string;
  name: string;
  owner_id: string;
  environment: string | null;
  connection_mode: string | null;
  is_virtual: boolean | null;
};

/** Resolve the caller's own router through the RLS-scoped tenant first. */
async function findSameTenantRouterForPlanSync(
  context: { supabase: unknown; userId: string },
  routerId: string,
): Promise<SupportRouterRow | null> {
  const supabase = context.supabase as import("./database.types").DatabaseClient;
  const { data: effectiveOwner, error: ownerError } = await supabase.rpc("effective_owner", {
    _user_id: context.userId,
  });
  if (ownerError) throw new Error(ownerError.message);
  const ownerId = (effectiveOwner as string | null) ?? context.userId;
  const { data, error } = await supabase
    .from("router_connections")
    .select("id, name, owner_id, environment, connection_mode, is_virtual")
    .eq("id", routerId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SupportRouterRow | null) ?? null;
}

function isBasicDefaultSupportAction(action: string): action is BasicDefaultSupportAction {
  return (BASIC_DEFAULT_SUPPORT_ACTIONS as readonly string[]).includes(action);
}

/**
 * Cross-tenant support may use only the explicitly listed basic action while
 * the target customer remains active. This is deliberately server-side and
 * fail-closed; no browser-provided account status is trusted.
 */
async function requireActiveTargetCustomerAccount(ownerId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: roleRows, error: roleError }, { data: entitlement, error: entitlementError }] =
    await Promise.all([
      supabaseAdmin.from("user_roles").select("role, expires_at").eq("user_id", ownerId),
      supabaseAdmin
        .from("account_entitlements")
        .select("tier, tier_expires_at")
        .eq("user_id", ownerId)
        .maybeSingle(),
    ]);
  if (roleError) throw new Error("Target customer account status could not be verified.");
  if (entitlementError) throw new Error("Target customer tier status could not be verified.");

  const rows = (roleRows ?? []) as Array<{ role: string; expires_at: string | null }>;
  const roles = rows.map((row) => row.role);
  const clientRole = rows.find((row) => row.role === "client");
  const tierExpiresAt = entitlement?.tier_expires_at ?? clientRole?.expires_at ?? null;
  const tierExpiry = tierExpiresAt ? Date.parse(String(tierExpiresAt)) : NaN;
  const restricted = roles.some((role) => ["suspended", "restricted"].includes(role));
  const active =
    roles.includes("client") &&
    !roles.some((role) => ["pending", "expired", "suspended", "restricted"].includes(role)) &&
    (!Number.isFinite(tierExpiry) || tierExpiry > Date.now());
  if (!active || restricted) {
    throw new Error("Target customer account is expired, suspended, restricted, or inactive.");
  }
}

async function requirePlatformSupportRouter(
  context: {
    supabase: unknown;
    userId: string;
  },
  routerId: string,
) {
  const { resolveAdminScope, tenantUserIdSet } = await import("./admin-scope.server");
  const scope = await resolveAdminScope(context as never);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("router_connections")
    .select("id, name, owner_id, environment, connection_mode, is_virtual")
    .eq("id", routerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Router not found.");
  const row = data as SupportRouterRow;
  if (!scope.isPlatformAdmin) {
    const allowed = await tenantUserIdSet(scope);
    if ((allowed && !allowed.has(row.owner_id)) || row.owner_id === scope.tenantId) {
      throw new Error("This router is outside your Platform Support scope.");
    }
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", row.owner_id);
    if ((targetRoles ?? []).some((target) => target.role === "primary")) {
      throw new Error("A Primary account cannot support another Primary tenant.");
    }
  }
  const { assertNotVirtualRouter } = await import("./test-router");
  assertNotVirtualRouter(row, "be opened in Platform Support");
  return row;
}

/** Read-only support check. Returns basic RouterOS identity, never credentials or configuration. */
export const inspectDeveloperSupportRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => routerIdSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const row = await requirePlatformSupportRouter(context, data.routerId);
    const started = Date.now();
    const { recordRouterOp } = await import("./audit.server");
    try {
      const { loadRouterConn } = await import("./router-conn.server");
      const { routerAPI } = await import("./mikrotik.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const conn = await loadRouterConn(supabaseAdmin, row.id, context.supabase);
      const [resource, identity] = await Promise.all([
        routerAPI.ping(conn),
        routerAPI.raw<{ name?: string }>(conn, "/system/identity").catch(() => null),
      ]);
      const resourceInfo = resource as { version?: string; "board-name"?: string };
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "developer_support_inspect",
        environment: row.environment ?? "production",
        outcome: "ok",
        detail: "Platform Support read-only router check",
        durationMs: Date.now() - started,
      });
      return {
        ok: true as const,
        routerName: row.name,
        identity: identity?.name ?? null,
        version: resourceInfo.version ?? null,
        board: resourceInfo["board-name"] ?? null,
        durationMs: Date.now() - started,
        rebootConfirmation: `REBOOT ${row.name}`,
      };
    } catch (error) {
      const { redactText } = await import("./redact.server");
      const message = redactText(error instanceof Error ? error.message : String(error)).slice(
        0,
        500,
      );
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "developer_support_inspect",
        environment: row.environment ?? "production",
        outcome: "failed",
        error: message,
        durationMs: Date.now() - started,
      });
      return { ok: false as const, routerName: row.name, error: message };
    }
  });

/** Controlled write: reboot only, with a support reason and exact typed confirmation. */
export const rebootDeveloperSupportRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        reason: z.string().trim().min(5).max(300),
        confirmation: z.string().max(200),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const row = await requirePlatformSupportRouter(context, data.routerId);
    const expected = `REBOOT ${row.name}`;
    const { recordRouterOp } = await import("./audit.server");
    if (data.confirmation !== expected) {
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "confirmation_failed",
        environment: row.environment ?? "production",
        outcome: "blocked",
        detail: "Platform Support reboot confirmation did not match.",
      });
      throw new Error(`Type ${expected} exactly to reboot this router.`);
    }

    const started = Date.now();
    try {
      const { loadRouterConn } = await import("./router-conn.server");
      const { routerAPI } = await import("./mikrotik.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const conn = await loadRouterConn(supabaseAdmin, row.id, context.supabase);
      await routerAPI.execScript(conn, "/system reboot");
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "developer_support_reboot",
        environment: row.environment ?? "production",
        outcome: "ok",
        detail: `Reason: ${data.reason}`,
        durationMs: Date.now() - started,
      });
      return { ok: true as const };
    } catch (error) {
      const { redactText } = await import("./redact.server");
      const message = redactText(error instanceof Error ? error.message : String(error)).slice(
        0,
        500,
      );
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "developer_support_reboot",
        environment: row.environment ?? "production",
        outcome: "failed",
        detail: `Reason: ${data.reason}`,
        error: message,
        durationMs: Date.now() - started,
      });
      throw new Error(message);
    }
  });

/**
 * Controlled write: add-only voucher plan sync onto a supported customer router.
 *
 * Plans always come from the *customer's* own portal_plans — support never pushes its own
 * catalogue. Nothing is removed: this is strictly create/update of the mm-* HotSpot profiles,
 * so custom profiles on the board survive. Requires a support reason and exact confirmation.
 */
export const syncPlansForSupportRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        reason: z.string().trim().min(5).max(300),
        confirmation: z.string().max(200),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const ownedRow = await findSameTenantRouterForPlanSync(context, data.routerId);
    const row = ownedRow ?? (await requirePlatformSupportRouter(context, data.routerId));
    const sameTenant = Boolean(ownedRow);
    const expected = `SYNC PLANS ${row.name}`;
    const { recordRouterOp } = await import("./audit.server");
    if (data.confirmation !== expected) {
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "confirmation_failed",
        environment: row.environment ?? "production",
        outcome: "blocked",
        detail: "Platform Support plan sync confirmation did not match.",
      });
      throw new Error(`Type ${expected} exactly to sync voucher plans.`);
    }

    let grant: { id: string } | null = null;
    if (sameTenant) {
      // Customer-owned sync follows the existing active-account voucher
      // operator guard, not a temporary cross-tenant delegation.
      const { requireVoucherOperator } = await import("./guards.server");
      await requireVoucherOperator(context.supabase, context.userId);
    } else {
      try {
        if (isBasicDefaultSupportAction("sync_plans")) {
          await requireActiveTargetCustomerAccount(row.owner_id);
        } else {
          const { assertActiveSupportGrant } = await import("./router-support-grants.server");
          grant = await assertActiveSupportGrant(row.id, context.userId, "sync_plans");
        }
      } catch (authorizationError) {
        await recordRouterOp({
          userId: context.userId,
          ownerId: row.owner_id,
          routerId: row.id,
          routerName: row.name,
          action: "developer_support_sync_plans",
          environment: row.environment ?? "production",
          outcome: "blocked",
          detail: isBasicDefaultSupportAction("sync_plans")
            ? "Basic support allowance denied because the target customer account is not active."
            : "No active owner delegation for sync_plans on this router.",
        });
        throw authorizationError;
      }
    }

    const started = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: plans, error } = await supabaseAdmin
      .from("portal_plans")
      .select("*")
      .eq("owner_id", row.owner_id)
      .order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    if (!plans?.length) throw new Error("This customer has no voucher plans saved yet.");

    try {
      const { loadRouterConn } = await import("./router-conn.server");
      const { assertHotspotReadyForPlanPush } =
        await import("./portal/push-plans-preflight.server");
      const { ensurePlanProfileOnRouter } = await import("./portal/ensure-plan-profile.server");
      const conn = await loadRouterConn(supabaseAdmin, row.id, context.supabase);
      try {
        await assertHotspotReadyForPlanPush(conn);
      } catch (preflightError) {
        const detail =
          preflightError instanceof Error ? preflightError.message : String(preflightError);
        throw new Error(
          `HotSpot is not ready on ${row.name}, so voucher plans cannot be pushed. ${detail} Ask the owner to finish HotSpot setup (Quick setup / Gateway Bootstrap) on this board, then retry the sync.`,
        );
      }

      let written = 0;
      const errors: string[] = [];
      for (const plan of plans) {
        try {
          await ensurePlanProfileOnRouter(conn, plan as never);
          written++;
        } catch (planError) {
          const { formatVoucherPlanPushError } = await import("./portal/plan-push-error");
          errors.push(
            `${(plan as { plan_key?: string }).plan_key ?? "plan"}: ${formatVoucherPlanPushError(planError)}`,
          );
        }
      }
      if (!written) throw new Error(errors.join(" | ") || "No voucher profiles could be saved.");

      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "developer_support_sync_plans",
        environment: row.environment ?? "production",
        outcome: errors.length ? "partial" : "ok",
        detail: `${sameTenant ? "Same-tenant voucher operator" : grant ? `Grant ${grant.id}` : "Basic support allowance"} · Reason: ${data.reason} · add-only · ${written}/${plans.length} profiles`,
        durationMs: Date.now() - started,
      });
      return {
        ok: true as const,
        written,
        total: plans.length,
        error: errors.length ? errors.join(" | ") : (null as string | null),
      };
    } catch (syncError) {
      const { redactText } = await import("./redact.server");
      const message = redactText(
        syncError instanceof Error ? syncError.message : String(syncError),
      ).slice(0, 500);
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "developer_support_sync_plans",
        environment: row.environment ?? "production",
        outcome: "failed",
        detail: `Reason: ${data.reason}`,
        error: message,
        durationMs: Date.now() - started,
      });
      throw new Error(message);
    }
  });

/** Read-only: does this support account currently hold a delegation on this router? */
export const getSupportGrantStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => routerIdSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const row = await requirePlatformSupportRouter(context, data.routerId);
    const { assertActiveSupportGrant } = await import("./router-support-grants.server");
    try {
      const grant = await assertActiveSupportGrant(row.id, context.userId, "sync_plans");
      return { granted: true as const, expiresAt: grant.expires_at, reason: grant.reason };
    } catch {
      return { granted: false as const, expiresAt: null, reason: null };
    }
  });

/**
 * Read-only: the most recent Platform Support plan-sync audit entry for this router, plus the
 * exact router/tenant context, so the support console can show what actually happened.
 */
export const getLatestSupportSyncAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => routerIdSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const row = await requirePlatformSupportRouter(context, data.routerId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entries, error } = await supabaseAdmin
      .from("router_ops_audit")
      .select("id, action, outcome, detail, error_message, duration_ms, created_at, user_id")
      .eq("router_id", row.id)
      .eq("user_id", context.userId)
      .in("action", ["developer_support_sync_plans", "confirmation_failed"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username")
      .eq("id", row.owner_id)
      .maybeSingle();
    const tenantLabel =
      (profile as { display_name?: string | null; username?: string | null } | null)
        ?.display_name ??
      (profile as { username?: string | null } | null)?.username ??
      `Tenant ${row.owner_id.slice(0, 8)}`;
    const entry = (entries ?? [])[0] as
      | {
          id: string;
          action: string;
          outcome: string;
          detail: string | null;
          error_message: string | null;
          duration_ms: number | null;
          created_at: string;
        }
      | undefined;
    return {
      router: {
        id: row.id,
        name: row.name,
        environment: row.environment ?? "production",
        connectionMode: row.connection_mode ?? "unknown",
      },
      tenant: { ownerId: row.owner_id, label: tenantLabel },
      entry: entry ?? null,
    };
  });
