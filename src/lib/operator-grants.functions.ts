import { hasTenantPrimaryRole } from "./app-role";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DatabaseClient } from "./database.types";
import {
  FEATURE_GRANT_ROLES,
  GRANTABLE_FEATURES,
  canOperateFeature,
  resolveAllowedFeatures,
  type FeatureGrantRole,
  type GrantableFeature,
} from "./operator-features";

async function loadGrantContext(supabase: DatabaseClient, userId: string, roles: string[]) {
  const grantRoles = roles.filter((r): r is FeatureGrantRole =>
    (FEATURE_GRANT_ROLES as readonly string[]).includes(r),
  );
  const [{ data: userGrants, error: userErr }, roleRes] = await Promise.all([
    supabase.from("operator_feature_grants").select("feature").eq("user_id", userId),
    grantRoles.length
      ? supabase
          .from("operator_feature_role_defaults")
          .select("role, feature")
          .in("role", grantRoles)
      : Promise.resolve({ data: [] as Array<{ role: string; feature: string }>, error: null }),
  ]);
  const { data: roleDefaults, error: roleErr } = roleRes;
  // SQL not applied yet on Lovable Cloud → empty grants (owner/admin still pass).
  if (userErr || roleErr) {
    return {
      roles,
      userGrants: [] as string[],
      roleDefaults: [] as Array<{ role: string; feature: string }>,
    };
  }
  return {
    roles,
    userGrants: ((userGrants ?? []) as Array<{ feature: string }>).map((r) => r.feature),
    roleDefaults: (roleDefaults ?? []) as Array<{ role: string; feature: string }>,
  };
}

export async function loadResolvedFeatures(
  supabase: DatabaseClient,
  userId: string,
  roles: string[],
  isPlatformAdmin = false,
): Promise<GrantableFeature[]> {
  const ctx = await loadGrantContext(supabase, userId, roles);
  return resolveAllowedFeatures({ ...ctx, isPlatformAdmin });
}

export async function assertCanOperateFeature(
  supabase: DatabaseClient,
  userId: string,
  feature: GrantableFeature,
): Promise<void> {
  const { getRoles, isPlatformAdminUser, requireNotExpired } = await import("./guards.server");
  const { FEATURE_DENIED, canOperateFeature, isFloorFeature } = await import("./operator-features");
  await requireNotExpired(supabase, userId);
  const [roles, isPlatformAdmin] = await Promise.all([
    getRoles(supabase, userId),
    isPlatformAdminUser(supabase, userId),
  ]);
  if (isPlatformAdmin) return;
  if (
    isFloorFeature(feature) &&
    canOperateFeature(feature, { roles, userGrants: [], roleDefaults: [] })
  ) {
    return;
  }
  const ctx = await loadGrantContext(supabase, userId, roles);
  if (!canOperateFeature(feature, { ...ctx, isPlatformAdmin })) {
    throw new Error(FEATURE_DENIED[feature]);
  }
}

/** Features the signed-in account may use. */
export const getMyOperatorFeatures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getRoles, isPlatformAdminUser } = await import("./guards.server");
    const [roles, isPlatformAdmin] = await Promise.all([
      getRoles(context.supabase, context.userId),
      isPlatformAdminUser(context.supabase, context.userId),
    ]);
    const ctx = await loadGrantContext(context.supabase, context.userId, roles);
    return {
      allowed: resolveAllowedFeatures({ ...ctx, isPlatformAdmin }),
      userGrants: ctx.userGrants.filter((f): f is GrantableFeature =>
        (GRANTABLE_FEATURES as readonly string[]).includes(f),
      ),
      roleDefaults: ctx.roleDefaults,
      isPrivileged: hasTenantPrimaryRole(roles) || isPlatformAdmin,
    };
  });

export const listOperatorFeatureGrantsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAdminScope, tenantUserIdSet, filterByUserIdSet } =
      await import("./admin-scope.server");
    const scope = await resolveAdminScope(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: roleDefaults, error: roleErr }, { data: userGrants, error: userErr }] =
      await Promise.all([
        supabaseAdmin
          .from("operator_feature_role_defaults")
          .select("role, feature, updated_at, updated_by"),
        supabaseAdmin
          .from("operator_feature_grants")
          .select("user_id, feature, granted_by, created_at"),
      ]);
    if (roleErr) throw new Error(roleErr.message);
    if (userErr) throw new Error(userErr.message);
    const allowed = await tenantUserIdSet(scope);
    return {
      roleDefaults: roleDefaults ?? [],
      userGrants: filterByUserIdSet(userGrants ?? [], allowed),
      isPlatformAdmin: scope.isPlatformAdmin,
    };
  });

export const setOperatorFeatureRoleDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        role: z.enum(FEATURE_GRANT_ROLES),
        features: z.array(z.enum(GRANTABLE_FEATURES)).max(GRANTABLE_FEATURES.length),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { requirePlatformAdmin } = await import("./admin-scope.server");
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("operator_feature_role_defaults").delete().eq("role", data.role);

    if (data.features.length) {
      const { error } = await supabaseAdmin.from("operator_feature_role_defaults").insert(
        data.features.map((feature) => ({
          role: data.role,
          feature,
          updated_by: context.userId,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const setOperatorFeatureUserGrants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        features: z.array(z.enum(GRANTABLE_FEATURES)).max(GRANTABLE_FEATURES.length),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { resolveAdminScope, assertTargetInScope } = await import("./admin-scope.server");
    const scope = await resolveAdminScope(context);
    await assertTargetInScope(scope, data.user_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("operator_feature_grants").delete().eq("user_id", data.user_id);

    if (data.features.length) {
      const { error } = await supabaseAdmin.from("operator_feature_grants").insert(
        data.features.map((feature) => ({
          user_id: data.user_id,
          feature,
          granted_by: context.userId,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });
