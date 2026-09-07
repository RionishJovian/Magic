/**
 * Server functions for Hotspot Wi-Fi setup on the Routers page.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type {
  HotspotApplyResult,
  HotspotSetupInput,
  HotspotSetupPreview,
  WifiHotspotProbe,
} from "./wifi-hotspot.server";
import { normalizeLanPorts } from "./wifi-hotspot.server";

const setupInputSchema = z.object({
  routerId: z.string().uuid(),
  mode: z.enum(["builtin-wifi", "lan-port"]),
  ssid: z.string().trim().min(1).max(32),
  bridge: z.string().min(1).max(64),
  bands: z.array(z.enum(["2.4", "5"])).default([]),
  lanPorts: z.array(z.string().max(32)).optional(),
  externalApConfirmed: z.boolean().optional(),
  /** @deprecated use lanPorts */
  lanPort: z.string().max(32).nullable().optional(),
  disableCapMode: z.boolean().default(false),
});

async function loadConn(supabase: unknown, routerId: string) {
  const { loadRouterConn } = await import("./router-conn.server");
  return loadRouterConn(supabase as never, routerId);
}

async function resolveOwnerId(supabase: unknown, userId: string): Promise<string> {
  const sb = supabase as {
    rpc: (
      fn: string,
      args: Record<string, string>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await sb.rpc("effective_owner", { _user_id: userId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? userId;
}

function toInput(data: z.infer<typeof setupInputSchema>): HotspotSetupInput {
  return {
    mode: data.mode,
    ssid: data.ssid,
    bridge: data.bridge,
    bands: data.bands,
    lanPorts: normalizeLanPorts({ lanPorts: data.lanPorts, lanPort: data.lanPort }),
    externalApConfirmed: data.externalApConfirmed === true,
    disableCapMode: data.disableCapMode,
  };
}

function summarizeApplyResult(input: HotspotSetupInput, result: HotspotApplyResult): string {
  const created = result.created.length;
  const skipped = result.skipped.length;
  const ports = input.mode === "lan-port" ? ` · ports ${input.lanPorts.join(",")}` : "";
  return `${input.mode} · SSID "${input.ssid}"${ports} · ${created} created, ${skipped} skipped`;
}

async function auditHotspotApply(input: {
  supabase: unknown;
  userId: string;
  ownerId: string;
  routerId: string;
  routerName: string;
  siteId: string | null;
  setupInput: HotspotSetupInput;
  result: HotspotApplyResult;
  durationMs: number;
}): Promise<void> {
  const { recordRouterOp } = await import("./audit.server");
  const { redactText } = await import("./redact.server");
  const summary = summarizeApplyResult(input.setupInput, input.result);

  await recordRouterOp({
    userId: input.userId,
    ownerId: input.ownerId,
    routerId: input.routerId,
    routerName: input.routerName,
    action: "hotspot_setup_result",
    outcome: "ok",
    detail: summary,
    durationMs: input.durationMs,
  });

  const sb = input.supabase as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<unknown>;
    };
  };

  for (const step of input.result.steps) {
    try {
      await sb.from("terminal_history").insert({
        user_id: input.userId,
        owner_id: input.ownerId,
        router_id: input.routerId,
        site_id: input.siteId,
        method: "POST",
        path: "/hotspot-setup/step",
        body: JSON.stringify({
          source: "hotspot_setup",
          label: step.label,
          outcome: step.outcome,
          transport: step.transport,
          command: step.command ? redactText(step.command).slice(0, 2000) : null,
          note: step.note ?? null,
          error: step.error ? redactText(step.error).slice(0, 500) : null,
        }),
        status: step.outcome === "failed" ? 400 : 200,
        ms: null,
        response_snippet: [step.outcome, step.transport, step.note, step.error]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 4000),
      });
    } catch {
      /* audit best-effort */
    }
  }
}

export const getWifiHotspotProbe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<WifiHotspotProbe> => {
    const c = await loadConn(context.supabase, data.routerId);
    const { probeWifiHotspot } = await import("./wifi-hotspot.server");
    return probeWifiHotspot(c);
  });

export const previewHotspotSetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => setupInputSchema.parse(raw))
  .handler(async ({ data, context }): Promise<HotspotSetupPreview> => {
    const c = await loadConn(context.supabase, data.routerId);
    const { previewHotspotSetup } = await import("./wifi-hotspot.server");
    return previewHotspotSetup(c, toInput(data));
  });

export const applyHotspotSetupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => setupInputSchema.parse(raw))
  .handler(async ({ data, context }): Promise<HotspotApplyResult> => {
    await (
      await import("./guards.server")
    ).requireFeature(context.supabase, context.userId, "router_config");
    const ownerId = await resolveOwnerId(context.supabase, context.userId);
    const { data: row } = await context.supabase
      .from("router_connections")
      .select("name, site_id")
      .eq("id", data.routerId)
      .single();
    const routerName = row?.name ?? "router";
    const setupInput = toInput(data);
    const { recordRouterOp } = await import("./audit.server");

    await recordRouterOp({
      userId: context.userId,
      ownerId,
      routerId: data.routerId,
      routerName,
      action: "hotspot_setup_started",
      outcome: "ok",
      detail: `${setupInput.mode} · SSID "${setupInput.ssid}" · ${setupInput.bridge}`,
    });

    const start = performance.now();
    const c = await loadConn(context.supabase, data.routerId);
    const { applyHotspotSetup } = await import("./wifi-hotspot.server");

    try {
      const result = await applyHotspotSetup(c, setupInput);
      const durationMs = Math.round(performance.now() - start);
      if (result.ok) {
        await auditHotspotApply({
          supabase: context.supabase,
          userId: context.userId,
          ownerId,
          routerId: data.routerId,
          routerName,
          siteId: (row?.site_id as string | null) ?? null,
          setupInput,
          result,
          durationMs,
        });
      } else {
        await recordRouterOp({
          userId: context.userId,
          ownerId,
          routerId: data.routerId,
          routerName,
          action: "hotspot_setup_result",
          outcome: "failed",
          detail: `${setupInput.mode} · SSID "${setupInput.ssid}" · partial apply`,
          error: result.error ?? "Apply failed",
          durationMs,
        });
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordRouterOp({
        userId: context.userId,
        ownerId,
        routerId: data.routerId,
        routerName,
        action: "hotspot_setup_result",
        outcome: "failed",
        detail: `${setupInput.mode} · SSID "${setupInput.ssid}" · failed`,
        error: msg,
        durationMs: Math.round(performance.now() - start),
      });
      throw e;
    }
  });

export const listHotspotSetupAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ routerId: z.string().uuid(), limit: z.number().int().min(1).max(20).default(5) })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const ownerId = await resolveOwnerId(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("router_ops_audit")
      .select("id, action, outcome, detail, error_message, duration_ms, created_at")
      .eq("owner_id", ownerId)
      .eq("router_id", data.routerId)
      .in("action", ["hotspot_setup_started", "hotspot_setup_result"])
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** @deprecated Use applyHotspotSetupFn */
export const createWifiHotspotSsid = applyHotspotSetupFn;

export const removeMagicHotspotGuestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (
      await import("./guards.server")
    ).requireFeature(context.supabase, context.userId, "router_config");
    const c = await loadConn(context.supabase, data.routerId);
    const { removeMagicHotspotGuest } = await import("./wifi-hotspot.server");
    return removeMagicHotspotGuest(c);
  });
