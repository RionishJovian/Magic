import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listTerminalHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        router_id: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(5000).default(1000),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requirePrivileged(context.supabase, context.userId);
    let q = context.supabase
      .from("terminal_history")
      .select(
        "id, router_id, site_id, method, path, body, status, ms, response_snippet, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.router_id) q = q.eq("router_id", data.router_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteTerminalHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ id: z.string().uuid().nullable().optional(), all: z.boolean().optional() })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requirePrivileged(context.supabase, context.userId);
    if (data.all) {
      const { error } = await context.supabase
        .from("terminal_history")
        .delete()
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { ok: true, cleared: true };
    }
    if (!data.id) throw new Error("id required");
    const { error } = await context.supabase.from("terminal_history").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWebfigLauncher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (
      await import("./webfig.server")
    ).requireWebfigLaunchAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("router_connections")
      .select("id, host, port, use_tls, username, connection_mode, cloud_peer_id, connector_id")
      .eq("id", data.routerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Router not found or access denied");
    const { webfigLaunchersForRows } = await import("./webfig.server");
    const launchers = await webfigLaunchersForRows(context.supabase, [row]);
    const launcher = launchers.get(row.id);
    if (!launcher) throw new Error("WebFig is not available on the sandbox router.");
    if (!launcher.url)
      throw new Error(launcher.reason ?? "WebFig is not available for this router.");
    return launcher;
  });
