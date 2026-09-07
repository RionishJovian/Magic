// Single source of truth for "may this account open this URL?".
//
// The navigation already encodes role visibility (src/lib/nav/modes.ts). This
// module reuses it so a typed URL is judged exactly like a hidden tab, and adds
// the few in-app paths that are not navigation tabs themselves.

import { canManageVoucherPrintLayouts, hasTenantPrimaryRole } from "../app-role";
import { canAccessPath, type Features, type Roles } from "./modes";

/** Paths that exist as pages but are not navigation tabs. */
const EXTRA_PATH_RULES: ReadonlyArray<{
  path: string;
  allowed: (roles: Roles, isPlatformAdmin: boolean) => boolean;
}> = [
  // Easy Mode is the simplified operator workspace.
  { path: "/app/easy", allowed: () => true },
  // Magic Dude is popup-only now; keep the old page URL reachable so saved
  // bookmarks can complete its backwards-compatible redirect to /app.
  { path: "/app/magic-dude", allowed: () => true },
  // Voucher layout is an owner configuration surface; voucher printing itself
  // remains available from Vouchers to permitted operators. Active café Users
  // manage their own receipt layout, but Agents never manage client branding.
  {
    path: "/app/voucher-layouts",
    allowed: (roles, isPlatformAdmin) => canManageVoucherPrintLayouts(roles, isPlatformAdmin),
  },
  // Test lab hub: lists the real-router and MCP tools, so it stays staff-only.
  { path: "/app/test-lab", allowed: isPrivileged },
  // Old sandbox bookmarks redirect to Real routers; still staff-only.
  { path: "/app/test-lab/sandbox", allowed: isPrivileged },
];

/** Where a blocked navigation lands. Always reachable, so it can't loop. */
export const GATE_FALLBACK = "/app";

function clean(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/app";
}

function isPrivileged(roles: Roles, isPlatformAdmin = false) {
  return hasTenantPrimaryRole(roles) || isPlatformAdmin;
}

export type GateResult = { allowed: true } | { allowed: false; redirectTo: string };

/**
 * Decides access for one URL. Never blocks the fallback itself, so a redirect
 * can never bounce twice.
 */
export function resolveRouteGate(
  roles: Roles,
  pathname: string,
  features?: Features,
  isPlatformAdmin = false,
  hasActivePlus = false,
  isTrial = false,
): GateResult {
  const path = clean(pathname);
  if (path === GATE_FALLBACK) return { allowed: true };

  const extra = EXTRA_PATH_RULES.find(
    (r) => r.path === path || (r.path === "/app/easy" && path.startsWith("/app/easy/")),
  );
  if (extra) {
    return !extra.allowed(roles, isPlatformAdmin)
      ? { allowed: false, redirectTo: GATE_FALLBACK }
      : { allowed: true };
  }

  if (canAccessPath(roles, path, features, isPlatformAdmin, hasActivePlus, isTrial))
    return { allowed: true };
  return { allowed: false, redirectTo: GATE_FALLBACK };
}
