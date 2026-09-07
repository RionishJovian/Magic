import { hasTenantPrimaryRole, TENANT_AGENT_ROLE } from "./app-role";

/**
 * Reseller contacts control voucher inventory and cash accountability. They
 * are therefore a protected operation, while the Reseller Operation dashboard
 * itself stays visible to every account after its trial period.
 */
export function canManageResellerInventory(
  roles: readonly string[] | null | undefined,
  isPlatformAdmin = false,
): boolean {
  return (
    isPlatformAdmin || hasTenantPrimaryRole(roles) || (roles ?? []).includes(TENANT_AGENT_ROLE)
  );
}

export const RESELLER_INVENTORY_LOCKED_REASON =
  "LOCKED — adding resellers is available to Primary, Developer, and MikroMagic Agent accounts.";
