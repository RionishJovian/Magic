/**
 * Tenant-facing management of time-limited "act on my router" support delegations.
 * Thin wrapper module: all helpers live in ./router-support-grants.server.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Routers of the caller's tenant plus every grant issued on them. */
export const listRouterSupportGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const {
      effectiveOwnerId,
      listGrantsForOwner,
      listSupportAccounts,
      isGrantActive,
      SUPPORT_GRANT_MAX_HOURS,
    } = await import("./router-support-grants.server");
    const ownerId = await effectiveOwnerId(context.supabase, context.userId);
    const [{ data: routers, error }, grants, supportAccounts] = await Promise.all([
      context.supabase
        .from("router_connections")
        .select("id, name, is_virtual")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true }),
      listGrantsForOwner(ownerId),
      listSupportAccounts(),
    ]);
    if (error) throw new Error(error.message);
    const { filterPhysicalRouters } = await import("./test-router");
    return {
      maxHours: SUPPORT_GRANT_MAX_HOURS,
      supportAccounts,
      routers: filterPhysicalRouters(routers ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
      })),
      grants: grants.map((g) => ({
        id: g.id,
        routerId: g.router_id,
        granteeUserId: g.grantee_user_id,
        actions: g.actions,
        reason: g.reason,
        expiresAt: g.expires_at,
        revokedAt: g.revoked_at,
        createdAt: g.created_at,
        active: isGrantActive(g),
      })),
    };
  });

/** Issue a grant. Router must belong to the caller's tenant; grantee must be a support account. */
export const grantRouterSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        granteeUserId: z.string().uuid(),
        actions: z.array(z.enum(["sync_plans"])).min(1),
        reason: z.string().trim().min(5).max(300),
        hours: z.number().int().min(1).max(72),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { effectiveOwnerId, isSupportAccount } = await import("./router-support-grants.server");
    const ownerId = await effectiveOwnerId(context.supabase, context.userId);
    if (!(await isSupportAccount(data.granteeUserId))) {
      throw new Error("That account is not an approved support account.");
    }
    if (data.granteeUserId === context.userId) {
      throw new Error("You cannot grant support access to yourself.");
    }
    const expiresAt = new Date(Date.now() + data.hours * 3600_000).toISOString();
    // RLS re-checks tenant write permission; a DB trigger re-checks router ownership.
    const { data: row, error } = await context.supabase
      .from("router_support_grants")
      .insert({
        owner_id: ownerId,
        router_id: data.routerId,
        grantee_user_id: data.granteeUserId,
        actions: data.actions,
        reason: data.reason,
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("id, expires_at")
      .single();
    if (error) throw new Error(error.message);

    const { recordRouterOp } = await import("./audit.server");
    await recordRouterOp({
      userId: context.userId,
      ownerId,
      routerId: data.routerId,
      routerName: "router",
      action: "support_grant_issued",
      environment: "production",
      outcome: "ok",
      detail: `Actions: ${data.actions.join(", ")} · expires ${expiresAt} · reason: ${data.reason}`,
    });
    return { ok: true as const, id: row.id as string, expiresAt: row.expires_at as string };
  });

/** Revoke immediately. Any in-flight support action re-checks the grant before writing. */
export const revokeRouterSupportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ grantId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { effectiveOwnerId } = await import("./router-support-grants.server");
    const ownerId = await effectiveOwnerId(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("router_support_grants")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.grantId)
      .is("revoked_at", null)
      .select("id, router_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Grant not found or already revoked.");

    const { recordRouterOp } = await import("./audit.server");
    await recordRouterOp({
      userId: context.userId,
      ownerId,
      routerId: row.router_id as string,
      routerName: "router",
      action: "support_grant_revoked",
      environment: "production",
      outcome: "ok",
      detail: "Support delegation revoked by the account owner.",
    });
    return { ok: true as const };
  });
