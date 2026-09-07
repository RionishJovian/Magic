import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Deployment history: every configuration push, rehearsal or real, with the
// plan hash, who ran it, what changed, the backup taken, the verification
// result and any rollback. Read-only from the app; rows are written by the
// provisioning path itself.

export const listDeployments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(5000).optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    let q = context.supabase
      .from("deployment_history")
      .select(
        "id, intent, mode, plan_hash, diff_summary, backup_ref, verification, status, failure_reason, rolled_back_at, created_at, actor_user_id, router_id",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 1000);
    if (data.routerId) q = q.eq("router_id", data.routerId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Resolve actor ids to readable names so the history is auditable by a
    // human, without exposing emails.
    const ids = Array.from(
      new Set((rows ?? []).map((r) => r.actor_user_id).filter((id): id is string => Boolean(id))),
    );
    let names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", ids);
      names = new Map(
        (profiles ?? []).map((p) => [p.id, p.display_name || p.username || "Unknown"]),
      );
    }
    return (rows ?? []).map((r) => ({
      ...r,
      actor_name: r.actor_user_id ? (names.get(r.actor_user_id) ?? "Unknown") : "System",
    }));
  });
