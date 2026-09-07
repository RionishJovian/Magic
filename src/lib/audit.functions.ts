import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const AUDIT_OPS_DEFAULT_LIMIT = 100;
export const AUDIT_SAVE_LIMIT = 200;
/** How often the Audit log page refetches while open (matches Live / Syslog). */
export const AUDIT_POLL_MS = 15_000;
export const ROUTER_OPS_AUDIT_QUERY_KEY = ["router-ops-audit"] as const;
export const ROUTER_SAVE_AUDIT_QUERY_KEY = ["router-save-audit"] as const;

async function enrichAuditUserNames<T extends { user_id: string }>(
  context: { supabase: unknown; userId: string },
  rows: T[],
): Promise<Array<T & { user_name: string | null; user_email: string | null }>> {
  if (rows.length === 0) {
    return [] as Array<T & { user_name: string | null; user_email: string | null }>;
  }
  const names = new Map<string, { name: string | null; email: string | null }>();
  try {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    const [{ data: profiles }, { data: authList }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, username, display_name").in("id", ids),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    ]);
    const emailById = new Map<string, string | null>(
      (authList?.users ?? []).map((u) => [u.id, u.email ?? null]),
    );
    for (const p of profiles ?? []) {
      names.set(p.id, {
        name: (p.username as string | null) ?? (p.display_name as string | null) ?? null,
        email: emailById.get(p.id) ?? null,
      });
    }
  } catch {
    // Non-privileged callers get rows without name enrichment.
  }
  return rows.map((r) => ({
    ...r,
    user_name: names.get(r.user_id)?.name ?? null,
    user_email: names.get(r.user_id)?.email ?? null,
  }));
}

/** Operations audit — connection checks, deploys, hotspot apply, TLS exceptions, etc. */
export const listRouterOpsAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ page: z.number().int().min(1).default(1) }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);

    const {
      data: rows,
      error,
      count,
    } = await context.supabase
      .from("router_ops_audit")
      .select(
        "id, user_id, router_id, router_name, action, environment, outcome, detail, error_message, duration_ms, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range((data.page - 1) * AUDIT_OPS_DEFAULT_LIMIT, data.page * AUDIT_OPS_DEFAULT_LIMIT - 1);
    if (error) throw new Error(error.message);
    return { rows: await enrichAuditUserNames(context, rows ?? []), total: count ?? 0 };
  });
