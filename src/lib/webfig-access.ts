import { hasTenantPrimaryRole, TENANT_AGENT_ROLE } from "./app-role";

/**
 * WebFig exposes the full RouterOS administration UI. It is therefore not
 * available to User, Trial, or Expired accounts. Primary, Developer, and
 * MikroMagic Agent accounts remain exempt from this product lock.
 */
export function canLaunchWebfig(
  roles: readonly string[] | null | undefined,
  isPlatformAdmin = false,
): boolean {
  return (
    isPlatformAdmin || hasTenantPrimaryRole(roles) || (roles ?? []).includes(TENANT_AGENT_ROLE)
  );
}

export const WEBFIG_LOCKED_REASON =
  "LOCKED — WebFig is available to Primary, Developer, and MikroMagic Agent accounts.";
