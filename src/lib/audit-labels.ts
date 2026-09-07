/** Human labels for router_ops_audit.action values (English — product convention). */
export const OPS_ACTION_LABELS: Record<string, string> = {
  connection_check: "Connection check",
  endpoint_validation_failed: "Endpoint validation failed",
  tls_exception_granted: "TLS exception granted",
  test_router_setup: "Test router setup",
  test_router_promoted: "Test router promoted",
  test_router_demoted: "Test router demoted",
  portal_deploy_started: "Portal deploy started",
  portal_deploy_result: "Portal deploy",
  portal_rollback_result: "Portal rollback",
  hotspot_setup_started: "Hotspot setup started",
  hotspot_setup_result: "Hotspot setup",
  quick_config_changed: "Quick config changed",
  login_bypass_shield_changed: "Login bypass shield",
  confirmation_failed: "Confirmation failed",
  wg_peer_created: "WireGuard peer created",
  wg_peer_inspected: "WireGuard peer inspected",
  wg_peer_disabled: "WireGuard peer disabled",
  wg_peer_removed: "WireGuard peer removed",
  wg_peer_authz_failed: "WireGuard authz failed",
  wg_peer_validation_failed: "WireGuard validation failed",
  wg_peer_persist_failed: "WireGuard persist failed",
  wg_peer_compensated: "WireGuard peer compensated",
  wg_peer_mismatch: "WireGuard peer mismatch",
  magic_dude_safe_check: "Magic Dude safe check",
};

export function labelOpsAction(action: string): string {
  return OPS_ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

export const OPS_OUTCOME_STYLE: Record<string, string> = {
  ok: "text-success",
  failed: "text-danger",
  partial: "text-amber-300",
  blocked: "text-muted-foreground",
};
