import { hasTenantPrimaryRole, TENANT_AGENT_ROLE } from "./app-role";

/**
 * Primary, Developer, and Agent accounts are exempt from the product lock.
 * Other account roles need an active, server-verified Magic Dude unlock.
 */
export function canUseMagicDude(
  roles: readonly string[] | null | undefined,
  isPlatformAdmin = false,
  isTrial = false,
): boolean {
  const list = roles ?? [];
  if (isPlatformAdmin || hasTenantPrimaryRole(list) || list.includes(TENANT_AGENT_ROLE))
    return true;
  return !isTrial && false;
}

export const MAGIC_DUDE_LOCKED_REASON =
  "LOCKED — An active User account may unlock Magic Dude with 5 Magic Coins for 30 days. Primary, Developer, and MikroMagic Agent accounts are exempt.";
