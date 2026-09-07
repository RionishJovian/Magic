/**
 * Public / customer-facing product claims must be derived from real app lists.
 * Do not hard-code marketing digits that can drift from nav or connection methods.
 */
import { connectionMethodsForRole } from "@/lib/connection-methods";
import { visibleNavItems } from "@/lib/nav/modes";

/** Help / teaser pages: real routes, not counted as “core tools”. */
export const NON_FEATURE_PATHS = ["/app/manual", "/app/magic-dude"] as const;

const CLIENT_ROLES = ["client"] as const;

/** Client-facing functional tools (excludes User manual help). */
export function clientCoreToolCount(): number {
  return visibleNavItems(CLIENT_ROLES).filter(
    (i) => !(NON_FEATURE_PATHS as readonly string[]).includes(i.to),
  ).length;
}

/** Paths customers use to reach a board (staff-only Public IP / DDNS excluded). */
export function clientConnectWayCount(): number {
  return connectionMethodsForRole(false).length;
}

export function clientConnectWayTitles(): string[] {
  return connectionMethodsForRole(false).map((m) => m.title);
}

/** Landing / marketing strip — digits linked to product code. */
export function landingProductStats(): ReadonlyArray<{ n: string; l: string }> {
  return [
    { n: String(clientCoreToolCount()), l: "Core tools" },
    { n: "24/7", l: "Live monitor" },
    { n: "1-click", l: "Portal deploy" },
    { n: String(clientConnectWayCount()), l: "Ways to connect" },
  ];
}
