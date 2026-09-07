import { createServerFn } from "@tanstack/react-start";
import type { DatabaseClient } from "./database.types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { TENANT_PRIMARY_ROLE } from "./app-role";
import { passwordSchema } from "./password-policy";

async function assertOwner(ctx: { supabase: DatabaseClient; userId: string }) {
  const { resolveAdminScope } = await import("./admin-scope.server");
  return resolveAdminScope(ctx);
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function createAccountError(error: unknown, username: string, step = "account setup"): Error {
  const record =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : record && typeof record.message === "string"
          ? record.message
          : "";
  const diagnostics = [
    message,
    record && typeof record.code === "string" ? `code ${record.code}` : "",
    record && typeof record.details === "string" ? String(record.details) : "",
    record && typeof record.hint === "string" ? String(record.hint) : "",
  ]
    .filter(Boolean)
    .join(" — ");

  if (/duplicate key|already registered|already exists|unique constraint/i.test(diagnostics)) {
    return new Error(`The username “${username}” is already in use. Choose another username.`);
  }
  if (/row-level security|permission denied|not authorized|forbidden/i.test(diagnostics)) {
    return new Error(
      "The account could not be created because the owner authorization check failed. Sign out, sign back in, and retry.",
    );
  }
  if (/column .+ does not exist|relation .+ does not exist/i.test(diagnostics)) {
    return new Error(
      "The account could not be created because the cloud database is missing a required update. Apply the pending migrations and republish.",
    );
  }
  return new Error(
    diagnostics && diagnostics !== "{}"
      ? `Could not finish creating “${username}” while ${step}. ${diagnostics}`
      : `Could not finish creating “${username}” while ${step}. Please retry once; if it still fails, check the cloud database logs.`,
  );
}

async function assertUserMgmtTarget(
  scope: Awaited<ReturnType<typeof assertOwner>>,
  targetUserId: string,
) {
  const { assertTargetInScope, assertCanManagePrimaryAccount } =
    await import("./admin-scope.server");
  await assertTargetInScope(scope, targetUserId);
  await assertCanManagePrimaryAccount(scope, targetUserId);
}

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { appStartOfMonth } = await import("./time");
    const { DEFAULT_MONTHLY_AI_SCAN_LIMIT } = await import("./ai-scan-quota");
    const periodStartIso = new Date(appStartOfMonth()).toISOString();

    const [
      { data: profiles },
      { data: roles },
      { data: authList },
      { data: limits },
      { data: runs },
      { data: referrals },
      { data: portalGrants },
      { data: portalRoleDefaults },
      featureGrantRes,
      featureRoleRes,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, username, avatar_url, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role, owner_id, created_at, expires_at"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      supabaseAdmin.from("ai_scan_limits").select("user_id, monthly_limit"),
      supabaseAdmin
        .from("fleet_scan_runs")
        .select("triggered_by")
        .gte("generated_at", periodStartIso),
      supabaseAdmin.from("account_referrals").select("user_id, agent_id"),
      supabaseAdmin.from("portal_mode_grants").select("user_id, mode"),
      supabaseAdmin.from("portal_mode_role_defaults").select("role, mode"),
      supabaseAdmin.from("operator_feature_grants").select("user_id, feature"),
      supabaseAdmin.from("operator_feature_role_defaults").select("role, feature"),
    ]);
    const featureGrants = featureGrantRes.error ? [] : (featureGrantRes.data ?? []);
    const featureRoleDefaults = featureRoleRes.error ? [] : (featureRoleRes.data ?? []);

    const agentByUser = new Map<string, string>();
    for (const r of referrals ?? []) agentByUser.set(r.user_id, r.agent_id);

    const emailById = new Map<string, { email: string | null; last_sign_in_at: string | null }>();
    for (const u of authList?.users ?? []) {
      emailById.set(u.id, {
        email: u.email ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      });
    }

    const limitByUser = new Map<string, number>();
    for (const l of limits ?? []) limitByUser.set(l.user_id, l.monthly_limit);

    const usedByUser = new Map<string, number>();
    for (const r of runs ?? []) {
      if (!r.triggered_by) continue;
      usedByUser.set(r.triggered_by, (usedByUser.get(r.triggered_by) ?? 0) + 1);
    }

    const { scopeUserIds } = await import("./admin-scope.server");
    const visibleIds = scopeUserIds(
      scope,
      (roles ?? []).map((r) => ({
        user_id: r.user_id,
        owner_id: r.owner_id ?? null,
        role: r.role as string,
      })),
    );

    const rolesByUser = new Map<string, string[]>();
    const expiresByUser = new Map<string, string | null>();
    const ownerByUser = new Map<string, string | null>();
    for (const r of roles ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUser.set(r.user_id, list);
      if (r.role === "client" && r.expires_at) expiresByUser.set(r.user_id, r.expires_at);
      if (r.owner_id && !ownerByUser.has(r.user_id)) ownerByUser.set(r.user_id, r.owner_id);
    }

    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.username ?? p.display_name ?? "—"]),
    );

    const portalGrantsByUser = new Map<string, string[]>();
    for (const g of portalGrants ?? []) {
      const list = portalGrantsByUser.get(g.user_id) ?? [];
      list.push(g.mode);
      portalGrantsByUser.set(g.user_id, list);
    }
    const portalRoleDefaultModes = (portalRoleDefaults ?? []) as Array<{
      role: string;
      mode: string;
    }>;

    const featureGrantsByUser = new Map<string, string[]>();
    for (const g of featureGrants ?? []) {
      const list = featureGrantsByUser.get(g.user_id) ?? [];
      list.push(g.feature);
      featureGrantsByUser.set(g.user_id, list);
    }
    const featureRoleDefaultRows = (featureRoleDefaults ?? []) as Array<{
      role: string;
      feature: string;
    }>;

    return (profiles ?? [])
      .filter((p) => visibleIds.has(p.id))
      .map((p) => ({
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        email: emailById.get(p.id)?.email ?? null,
        last_sign_in_at: emailById.get(p.id)?.last_sign_in_at ?? null,
        roles: rolesByUser.get(p.id) ?? [],
        owner_id: ownerByUser.get(p.id) ?? null,
        client_expires_at: expiresByUser.get(p.id) ?? null,
        agent_id: agentByUser.get(p.id) ?? null,
        agent_name: agentByUser.has(p.id) ? (nameById.get(agentByUser.get(p.id)!) ?? "—") : null,
        scan_limit: limitByUser.get(p.id) ?? DEFAULT_MONTHLY_AI_SCAN_LIMIT,
        scan_limit_is_custom: limitByUser.has(p.id),
        scans_used_this_month: usedByUser.get(p.id) ?? 0,
        scan_limit_default: DEFAULT_MONTHLY_AI_SCAN_LIMIT,
        portal_mode_grants: portalGrantsByUser.get(p.id) ?? [],
        portal_role_defaults: portalRoleDefaultModes,
        operator_feature_grants: featureGrantsByUser.get(p.id) ?? [],
        operator_feature_role_defaults: featureRoleDefaultRows,
      }));
  });

/** Owner-only: set or clear an account's monthly AI scan allowance. */
export const setAppUserScanLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        monthly_limit: z.number().int().min(0).max(500).nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const scope = await assertOwner(context);
    await assertUserMgmtTarget(scope, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.monthly_limit === null) {
      const { error } = await supabaseAdmin
        .from("ai_scan_limits")
        .delete()
        .eq("user_id", data.user_id);
      if (error) throw new Error(error.message);
      return { ok: true, monthly_limit: null };
    }

    const { data: ownerId } = await context.supabase.rpc("effective_owner", {
      _user_id: context.userId,
    });
    const { error } = await supabaseAdmin.from("ai_scan_limits").upsert(
      {
        user_id: data.user_id,
        owner_id: (ownerId as string) ?? context.userId,
        monthly_limit: data.monthly_limit,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, monthly_limit: data.monthly_limit };
  });

/** Owner-only: set a User account's access expiry.
 *  - Future date → live User (client) until that timestamp
 *  - Past/now date → Expired immediately (read-only)
 *  Primary accounts cannot expire. Agents have no trial window. */
export const setAppUserExpires = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        expires_at: z
          .string()
          .min(10)
          .refine((s) => Number.isFinite(Date.parse(s)), "Invalid expiry date"),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const scope = await assertOwner(context);
    await assertUserMgmtTarget(scope, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("user_roles")
      .select("role, owner_id")
      .eq("user_id", data.user_id);
    const roles = (rows ?? []).map((r) => r.role as string);
    if (roles.includes(TENANT_PRIMARY_ROLE)) {
      throw new Error("Primary accounts do not expire.");
    }
    if (roles.includes("agent") && !roles.includes("client") && !roles.includes("expired")) {
      throw new Error("Agent accounts do not use trial expiry. Change the role to User first.");
    }

    const { resolveUserRoleOwnerId } = await import("./user-role-owner");
    const priorOwner = (rows ?? []).find((r) => r.owner_id)?.owner_id ?? null;
    const ownerId = resolveUserRoleOwnerId({
      role: "client",
      subjectUserId: data.user_id,
      scope,
      existingOwnerId: (priorOwner as string | null) ?? null,
    });

    const when = Date.parse(data.expires_at);
    const expiredNow = when <= Date.now();

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.from("user_roles").insert(
      expiredNow
        ? {
            user_id: data.user_id,
            role: "expired",
            owner_id: ownerId,
            expires_at: null,
          }
        : {
            user_id: data.user_id,
            role: "client",
            owner_id: ownerId,
            expires_at: new Date(when).toISOString(),
          },
    );
    if (error) throw new Error(error.message);
    return {
      ok: true,
      role: expiredNow ? ("expired" as const) : ("client" as const),
      expires_at: expiredNow ? null : new Date(when).toISOString(),
    };
  });

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        username: z
          .string()
          .min(2)
          .max(60)
          .regex(/^[a-zA-Z0-9._-]+$/, "letters, digits, . _ - only"),
        password: passwordSchema(),
        display_name: z.string().max(120).optional(),
        role: z.enum([TENANT_PRIMARY_ROLE, "client", "agent"]).default("client"),
        /** @deprecated Users/Agents self-own; kept optional for older clients. */
        tenant_primary_id: z.string().uuid().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const scope = await assertOwner(context);
    if (data.role === TENANT_PRIMARY_ROLE && !scope.isPlatformAdmin) {
      throw new Error("Forbidden: only a platform administrator can create primary accounts.");
    }
    const { resolveUserRoleOwnerId, assertSingleCafePrimary } = await import("./user-role-owner");
    if (data.role === TENANT_PRIMARY_ROLE) {
      await assertSingleCafePrimary();
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.trim();
    // Keep the internal login address in the same canonical lowercase form as
    // existing accounts. Auth treats domains case-insensitively, but a few
    // hosted Auth validation paths reject the mixed-case synthetic domain.
    const email = `${username.toLowerCase()}@mikromagic`;

    // Auth users created by the older non-transactional flow can survive after
    // their profile/role setup failed. Detect those records before creating a
    // new Auth user instead of returning an opaque `{}` error from Supabase.
    const escapedUsername = escapeIlike(username);
    const [{ data: existingOwner }, { data: existingProfile }, { data: authUsers }] =
      await Promise.all([
        supabaseAdmin
          .from("owner_accounts")
          .select("user_id")
          .ilike("username", escapedUsername)
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("username", escapedUsername)
          .limit(1)
          .maybeSingle(),
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);
    if (existingOwner?.user_id || existingProfile?.id) {
      throw createAccountError({ message: "already exists" }, username);
    }
    const orphanedAuthUser = (authUsers?.users ?? []).find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (orphanedAuthUser) {
      throw new Error(
        `An incomplete account for “${username}” already exists. Remove that incomplete account from Supabase Auth before retrying.`,
      );
    }

    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.display_name ?? data.username },
    });
    if (created.error || !created.data.user) {
      throw createAccountError(
        created.error ?? "Failed to create user",
        username,
        "creating the Auth record",
      );
    }
    const userId = created.data.user.id;

    try {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          { id: userId, username, display_name: data.display_name ?? username },
          { onConflict: "id" },
        );
      if (profileError) throw createAccountError(profileError, username, "saving the profile");

      // Wipe any auto-assigned role from the handle_new_user trigger, then set requested role.
      // owner_id records the direct parent/creator; operational data remains scoped by
      // effective_owner() and platform authority is checked separately.
      const { error: roleDeleteError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (roleDeleteError)
        throw createAccountError(roleDeleteError, username, "preparing the account role");

      const ownerId = resolveUserRoleOwnerId({
        role: data.role,
        subjectUserId: userId,
        scope,
      });
      const { error: roleInsertError } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: data.role,
        owner_id: ownerId,
        expires_at:
          data.role === "client"
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            : null,
      });
      if (roleInsertError)
        throw createAccountError(roleInsertError, username, "saving the account role");

      const { error: ownerAccountError } = await supabaseAdmin.from("owner_accounts").upsert(
        {
          username,
          auth_email: email,
          user_id: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "username" },
      );
      if (ownerAccountError)
        throw createAccountError(ownerAccountError, username, "saving the username mapping");
    } catch (error) {
      // Do not leave an Auth user that cannot be retried because its app records failed.
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw error instanceof Error ? error : createAccountError(error, username);
    }

    return { ok: true, id: userId };
  });

export const setAppUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum([TENANT_PRIMARY_ROLE, "client", "expired", "agent", "pending"]),
        tenant_primary_id: z.string().uuid().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const scope = await assertOwner(context);
    await assertUserMgmtTarget(scope, data.user_id);
    if (data.role === TENANT_PRIMARY_ROLE && !scope.isPlatformAdmin) {
      throw new Error("Forbidden: only a platform administrator can grant the primary role.");
    }
    if (data.user_id === context.userId && data.role !== TENANT_PRIMARY_ROLE) {
      throw new Error("You cannot demote yourself.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveUserRoleOwnerId, assertSingleCafePrimary } = await import("./user-role-owner");
    if (data.role === TENANT_PRIMARY_ROLE) {
      await assertSingleCafePrimary(data.user_id);
    }
    const { data: prior } = await supabaseAdmin
      .from("user_roles")
      .select("owner_id")
      .eq("user_id", data.user_id)
      .not("owner_id", "is", null)
      .limit(1)
      .maybeSingle();
    const ownerId = resolveUserRoleOwnerId({
      role: data.role,
      subjectUserId: data.user_id,
      scope,
      existingOwnerId: (prior?.owner_id as string | null) ?? null,
    });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: data.user_id,
      role: data.role,
      owner_id: ownerId,
      expires_at:
        data.role === "client"
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Reactivate an expired account — promote it back to client with a fresh 1-month window. */
export const activateAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ user_id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const scope = await assertOwner(context);
    await assertUserMgmtTarget(scope, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Manual reactivation is NOT a paid Tier Pass: it never awards Magic Coins.
    const { resolveUserRoleOwnerId } = await import("./user-role-owner");
    const { data: prior } = await supabaseAdmin
      .from("user_roles")
      .select("owner_id")
      .eq("user_id", data.user_id)
      .not("owner_id", "is", null)
      .limit(1)
      .maybeSingle();
    const ownerId = resolveUserRoleOwnerId({
      role: "client",
      subjectUserId: data.user_id,
      scope,
      existingOwnerId: (prior?.owner_id as string | null) ?? null,
    });

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: data.user_id,
      role: "client",
      owner_id: ownerId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/**
 * Owner-only: approve an agent-created pending account. Turns it into a live
 * client with a 1-month window. No signup commission is awarded.
 */
export const approvePendingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ user_id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const scope = await assertOwner(context);
    await assertUserMgmtTarget(scope, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    const isPending = (current ?? []).some((r) => r.role === "pending");
    if (!isPending) throw new Error("This account is not waiting for approval.");

    const { resolveUserRoleOwnerId } = await import("./user-role-owner");
    const { data: prior } = await supabaseAdmin
      .from("user_roles")
      .select("owner_id")
      .eq("user_id", data.user_id)
      .not("owner_id", "is", null)
      .limit(1)
      .maybeSingle();
    const ownerId = resolveUserRoleOwnerId({
      role: "client",
      subjectUserId: data.user_id,
      scope,
      existingOwnerId: (prior?.owner_id as string | null) ?? null,
    });

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: data.user_id,
      role: "client",
      owner_id: ownerId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/** Owner-only: reject and remove an agent-created pending account. No points awarded. */
export const rejectPendingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ user_id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const scope = await assertOwner(context);
    await assertUserMgmtTarget(scope, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("account_referrals").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("owner_accounts").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetAppUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ user_id: z.string().uuid(), password: passwordSchema() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    const scope = await assertOwner(context);
    await assertUserMgmtTarget(scope, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ user_id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    const scope = await assertOwner(context);
    await assertUserMgmtTarget(scope, data.user_id);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("account_referrals").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("owner_accounts").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
