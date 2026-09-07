import { recordRouterOp } from "./audit.server";
import type { DatabaseClient } from "./database.types";
import type { QuickConfigFeature } from "./quick-config.server";

async function routerMeta(supabase: DatabaseClient, userId: string, routerId: string) {
  const { effectiveOwner } = await import("./guards.server");
  const ownerId = await effectiveOwner(supabase, userId);
  const { data } = await supabase
    .from("router_connections")
    .select("name")
    .eq("id", routerId)
    .maybeSingle();
  return { ownerId, routerName: data?.name ?? null };
}

export async function recordQuickConfigOp(input: {
  supabase: DatabaseClient;
  userId: string;
  routerId: string;
  feature: QuickConfigFeature;
  enabled: boolean;
  outcome: "ok" | "failed";
  error?: unknown;
  durationMs?: number;
}): Promise<void> {
  const { ownerId, routerName } = await routerMeta(input.supabase, input.userId, input.routerId);
  await recordRouterOp({
    userId: input.userId,
    ownerId,
    routerId: input.routerId,
    routerName,
    action: "quick_config_changed",
    outcome: input.outcome,
    detail: `${input.feature} → ${input.enabled ? "on" : "off"}`,
    error: input.error,
    durationMs: input.durationMs,
  });
}

export async function recordShieldOp(input: {
  supabase: DatabaseClient;
  userId: string;
  routerId: string;
  enabled: boolean;
  outcome: "ok" | "failed" | "partial";
  detail?: string | null;
  error?: unknown;
  durationMs?: number;
}): Promise<void> {
  const { ownerId, routerName } = await routerMeta(input.supabase, input.userId, input.routerId);
  await recordRouterOp({
    userId: input.userId,
    ownerId,
    routerId: input.routerId,
    routerName,
    action: "login_bypass_shield_changed",
    outcome: input.outcome,
    detail: input.detail ?? `login_bypass_shield → ${input.enabled ? "on" : "off"}`,
    error: input.error,
    durationMs: input.durationMs,
  });
}
