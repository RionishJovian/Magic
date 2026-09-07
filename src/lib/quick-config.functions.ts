/**
 * TanStack Start server functions for the Quick Config panel.
 * Each function authenticates the caller, verifies router ownership via RLS,
 * then delegates to quick-config.server.ts for the actual RouterOS REST work.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { QuickConfigFeature, QuickConfigSnapshot, FeatureStatus } from "./quick-config.server";

const featureEnum = z.enum([
  "clientIsolation",
  "wanInputGuard",
  "loginFloodGuard",
  "ntpSync",
] as const satisfies [QuickConfigFeature, ...QuickConfigFeature[]]);

const fairShareSchema = z.object({
  routerId: z.string().uuid(),
  guestCidr: z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}\/(?:[89]|[12]\d|3[0-2])$/),
  downloadMbps: z.number().positive().max(10_000),
  uploadMbps: z.number().positive().max(10_000),
});

async function loadConn(supabase: unknown, routerId: string) {
  const { loadRouterConn } = await import("./router-conn.server");
  return loadRouterConn(supabase as never, routerId);
}

/** Read current state of all quick-config features for one router. */
export const getQuickConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<QuickConfigSnapshot> => {
    const c = await loadConn(context.supabase, data.routerId);
    const { readQuickConfig } = await import("./quick-config.server");
    return readQuickConfig(c);
  });

/** Configure fair-share QoS only after the operator explicitly selects guest CIDR and WAN rates. */
export const configureFairShareQos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => fairShareSchema.parse(raw))
  .handler(async ({ data, context }): Promise<FeatureStatus> => {
    const start = performance.now();
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const c = await loadConn(context.supabase, data.routerId);
    const { configureFairShareQos: configure } = await import("./quick-config.server");
    const { recordQuickConfigOp } = await import("./quick-config-audit.server");
    try {
      const result = await configure(c, data);
      await recordQuickConfigOp({
        supabase: context.supabase,
        userId: context.userId,
        routerId: data.routerId,
        feature: "fairShareQos",
        enabled: true,
        outcome: "ok",
        durationMs: Math.round(performance.now() - start),
      });
      return result;
    } catch (e) {
      await recordQuickConfigOp({
        supabase: context.supabase,
        userId: context.userId,
        routerId: data.routerId,
        feature: "fairShareQos",
        enabled: true,
        outcome: "failed",
        error: e,
        durationMs: Math.round(performance.now() - start),
      });
      throw e;
    }
  });

/** Toggle a single quick-config feature on or off for one router. */
export const setQuickConfigFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        feature: featureEnum,
        enabled: z.boolean(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<FeatureStatus> => {
    const start = performance.now();
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const c = await loadConn(context.supabase, data.routerId);
    const { applyQuickConfigFeature } = await import("./quick-config.server");
    const { recordQuickConfigOp } = await import("./quick-config-audit.server");

    try {
      const result = await applyQuickConfigFeature(c, data.feature, data.enabled);
      await recordQuickConfigOp({
        supabase: context.supabase,
        userId: context.userId,
        routerId: data.routerId,
        feature: data.feature,
        enabled: data.enabled,
        outcome: "ok",
        durationMs: Math.round(performance.now() - start),
      });
      return result;
    } catch (e) {
      await recordQuickConfigOp({
        supabase: context.supabase,
        userId: context.userId,
        routerId: data.routerId,
        feature: data.feature,
        enabled: data.enabled,
        outcome: "failed",
        error: e,
        durationMs: Math.round(performance.now() - start),
      });
      throw e;
    }
  });
