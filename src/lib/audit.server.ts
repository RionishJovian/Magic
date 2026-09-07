// Structured operations audit for router connectivity, TLS/endpoint validation,
// test-router lifecycle, portal deployment and confirmation failures.
// Secrets (passwords, tokens, signed URLs) are never recorded here.

export type RouterOpAction =
  | "connection_check"
  | "endpoint_validation_failed"
  | "tls_exception_granted"
  | "test_router_setup"
  | "test_router_promoted"
  | "test_router_demoted"
  | "portal_deploy_started"
  | "portal_deploy_result"
  | "portal_rollback_result"
  | "hotspot_setup_started"
  | "hotspot_setup_result"
  | "gateway_bootstrap_preview"
  | "gateway_bootstrap_result"
  | "quick_config_changed"
  | "login_bypass_shield_changed"
  | "confirmation_failed"
  | "wg_peer_created"
  | "wg_peer_inspected"
  | "wg_peer_disabled"
  | "wg_peer_removed"
  | "wg_peer_authz_failed"
  | "wg_peer_validation_failed"
  | "wg_peer_persist_failed"
  | "wg_peer_compensated"
  | "wg_peer_mismatch"
  | "developer_support_inspect"
  | "developer_support_reboot"
  | "developer_support_sync_plans"
  | "support_grant_issued"
  | "support_grant_revoked"
  | "developer_tenant_viewed"
  | "developer_terminal_read"
  | "developer_terminal_write"
  | "magic_dude_safe_check"
  | "voucher_enforcement";

export type RouterOpOutcome = "ok" | "failed" | "partial" | "blocked";

export async function recordRouterOp(input: {
  userId: string;
  ownerId?: string | null;
  routerId?: string | null;
  routerName?: string | null;
  action: RouterOpAction;
  environment?: string | null;
  outcome: RouterOpOutcome;
  detail?: string | null;
  error?: unknown;
  durationMs?: number | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const err = input.error;
    const message = err instanceof Error ? err.message : err ? String(err) : null;
    await supabaseAdmin.from("router_ops_audit").insert({
      user_id: input.userId,
      owner_id: input.ownerId ?? null,
      router_id: input.routerId ?? null,
      router_name: input.routerName ?? null,
      action: input.action,
      environment: input.environment ?? "production",
      outcome: input.outcome,
      detail: input.detail ? input.detail.slice(0, 500) : null,
      error_message: message ? message.slice(0, 500) : null,
      duration_ms: input.durationMs == null ? null : Math.round(input.durationMs),
    });
  } catch (e) {
    console.error("[audit] failed to record router_ops_audit", e);
  }
}
