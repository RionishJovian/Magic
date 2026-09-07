import { createServerFn } from "@tanstack/react-start";
import type { DatabaseClient } from "./database.types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertTenantConsoleAccess(ctx: { supabase: DatabaseClient; userId: string }) {
  const { resolveAdminScope } = await import("./admin-scope.server");
  return resolveAdminScope(ctx);
}

export type TenantOverview = {
  id: string;
  username: string | null;
  display_name: string | null;
  email: string | null;
  roles: string[];
  last_sign_in_at: string | null;
  created_at: string | null;
  router_count: number;
  last_router_save: string | null;
  last_deploy: string | null;
};

export const listTenantsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TenantOverview[]> => {
    const scope = await assertTenantConsoleAccess(context);
    const { tenantUserIdSet } = await import("./admin-scope.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const allowedIds = await tenantUserIdSet(scope);

    const [
      { data: profiles },
      { data: roles },
      { data: authList },
      { data: routers },
      { data: saves },
      { data: deploys },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, username, display_name, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      supabaseAdmin.from("router_connections").select("owner_id"),
      supabaseAdmin
        .from("router_save_audit")
        .select("user_id, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("portal_deploy_audit")
        .select("user_id, created_at")
        .order("created_at", { ascending: false }),
    ]);

    const emailById = new Map<string, { email: string | null; last_sign_in_at: string | null }>();
    for (const u of authList?.users ?? []) {
      emailById.set(u.id, {
        email: u.email ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      });
    }

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUser.set(r.user_id, list);
    }

    const routerCount = new Map<string, number>();
    for (const r of routers ?? []) {
      const oid = (r as { owner_id: string | null }).owner_id;
      if (!oid) continue;
      routerCount.set(oid, (routerCount.get(oid) ?? 0) + 1);
    }

    const firstBy = (rows: Array<{ user_id: string | null; created_at: string }> | null) => {
      const m = new Map<string, string>();
      for (const row of rows ?? []) {
        if (!row.user_id) continue;
        if (!m.has(row.user_id)) m.set(row.user_id, row.created_at);
      }
      return m;
    };
    const lastSave = firstBy(saves);
    const lastDeploy = firstBy(deploys);

    return (profiles ?? [])
      .filter((p) => !allowedIds || allowedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        email: emailById.get(p.id)?.email ?? null,
        last_sign_in_at: emailById.get(p.id)?.last_sign_in_at ?? null,
        created_at: p.created_at,
        roles: rolesByUser.get(p.id) ?? [],
        router_count: routerCount.get(p.id) ?? 0,
        last_router_save: lastSave.get(p.id) ?? null,
        last_deploy: lastDeploy.get(p.id) ?? null,
      }));
  });
