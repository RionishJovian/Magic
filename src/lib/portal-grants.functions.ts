import { hasTenantPrimaryRole } from "./app-role";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DatabaseClient } from "./database.types";
import {
  GRANTABLE_PORTAL_MODES,
  PORTAL_GRANT_ROLES,
  canOperatePortalMode,
  resolveAllowedPortalModes,
  type GrantablePortalMode,
  type PortalGrantRole,
  type PortalGuestMode,
} from "./portal/modes";

async function loadGrantContext(supabase: DatabaseClient, userId: string, roles: string[]) {
  const grantRoles = roles.filter((r): r is PortalGrantRole =>
    (PORTAL_GRANT_ROLES as readonly string[]).includes(r),
  );
  const [{ data: userGrants }, roleRes] = await Promise.all([
    supabase.from("portal_mode_grants").select("mode").eq("user_id", userId),
    grantRoles.length
      ? supabase.from("portal_mode_role_defaults").select("role, mode").in("role", grantRoles)
      : Promise.resolve({ data: [] as Array<{ role: string; mode: string }>, error: null }),
  ]);
  const { data: roleDefaults } = roleRes;
  return {
    roles,
    userGrants: ((userGrants ?? []) as Array<{ mode: string }>).map((r) => r.mode),
    roleDefaults: (roleDefaults ?? []) as Array<{ role: string; mode: string }>,
  };
}

/** Modes the signed-in account may enable on their portal. */
export const getMyPortalModePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getRoles, isPlatformAdminUser } = await import("./guards.server");
    const [roles, isPlatformAdmin] = await Promise.all([
      getRoles(context.supabase, context.userId),
      isPlatformAdminUser(context.supabase, context.userId),
    ]);
    const ctx = await loadGrantContext(context.supabase, context.userId, roles);
    const allowed = resolveAllowedPortalModes({ ...ctx, isPlatformAdmin });
    return {
      allowed,
      userGrants: ctx.userGrants.filter((m): m is GrantablePortalMode =>
        (GRANTABLE_PORTAL_MODES as readonly string[]).includes(m),
      ),
      roleDefaults: ctx.roleDefaults,
      isPrivileged: hasTenantPrimaryRole(roles) || isPlatformAdmin,
    };
  });

/** Owner/admin: list role defaults + every per-user grant. */
export const listPortalModeGrantsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAdminScope, tenantUserIdSet, filterByUserIdSet } =
      await import("./admin-scope.server");
    const scope = await resolveAdminScope(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: roleDefaults }, { data: userGrants }] = await Promise.all([
      supabaseAdmin.from("portal_mode_role_defaults").select("role, mode, updated_at, updated_by"),
      supabaseAdmin.from("portal_mode_grants").select("user_id, mode, granted_by, created_at"),
    ]);
    const allowed = await tenantUserIdSet(scope);
    return {
      roleDefaults: roleDefaults ?? [],
      userGrants: filterByUserIdSet(userGrants ?? [], allowed),
      isPlatformAdmin: scope.isPlatformAdmin,
    };
  });

export const setPortalModeRoleDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        role: z.enum(PORTAL_GRANT_ROLES),
        modes: z.array(z.enum(GRANTABLE_PORTAL_MODES)).max(2),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { requirePlatformAdmin } = await import("./admin-scope.server");
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("portal_mode_role_defaults").delete().eq("role", data.role);

    if (data.modes.length) {
      const { error } = await supabaseAdmin.from("portal_mode_role_defaults").insert(
        data.modes.map((mode) => ({
          role: data.role,
          mode,
          updated_by: context.userId,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const setPortalModeUserGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        modes: z.array(z.enum(GRANTABLE_PORTAL_MODES)).max(2),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { resolveAdminScope, assertTargetInScope } = await import("./admin-scope.server");
    const scope = await resolveAdminScope(context);
    await assertTargetInScope(scope, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("portal_mode_grants").delete().eq("user_id", data.user_id);

    if (data.modes.length) {
      const { error } = await supabaseAdmin.from("portal_mode_grants").insert(
        data.modes.map((mode) => ({
          user_id: data.user_id,
          mode,
          granted_by: context.userId,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export async function assertCanOperateGuestMode(
  supabase: DatabaseClient,
  userId: string,
  mode: PortalGuestMode,
): Promise<void> {
  const { getRoles, isPlatformAdminUser } = await import("./guards.server");
  const [roles, isPlatformAdmin] = await Promise.all([
    getRoles(supabase, userId),
    isPlatformAdminUser(supabase, userId),
  ]);
  const ctx = await loadGrantContext(supabase, userId, roles);
  if (!canOperatePortalMode(mode, { ...ctx, isPlatformAdmin })) {
    throw new Error(
      `Your account is not permitted to use the "${mode}" portal mode. Ask the app owner to grant permission.`,
    );
  }
}
