// Staged rollout gates for router operations.
//
// Pure, testable rules shared by the server functions and the UI. Nothing here
// touches a router — it only decides whether an action is allowed to proceed.

export type RouterEnvironment = "test" | "production";

/** Shown when a leftover virtual-lab row is still in the database. */
export const SANDBOX_REMOVED_MESSAGE =
  "The in-app sandbox lab has been removed. Connect a physical MikroTik (Magic Hub, Local Connector, or public IP).";

export function isVirtualRouter(r: {
  is_virtual?: boolean | null;
  connection_mode?: string | null;
}): boolean {
  return r.is_virtual === true || r.connection_mode === "sandbox";
}

export function filterPhysicalRouters<
  T extends { is_virtual?: boolean | null; connection_mode?: string | null },
>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter((r) => !isVirtualRouter(r));
}

export function assertNotVirtualRouter(
  row: { is_virtual?: boolean | null; connection_mode?: string | null } | null | undefined,
  action: string,
): void {
  if (row && isVirtualRouter(row)) {
    throw new Error(`This router cannot ${action}. ${SANDBOX_REMOVED_MESSAGE}`);
  }
}

export class ConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfirmationError";
  }
}

/** Test routers may be touched one at a time; production allows a small batch. */
export const BATCH_LIMIT: Record<RouterEnvironment, number> = { test: 1, production: 5 };

export function normalizeConfirmation(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function expectedConfirmation(
  action: "promote" | "demote" | "deploy" | "insecure-tls",
  environment: RouterEnvironment,
  routerName: string,
): string {
  const name = normalizeConfirmation(routerName);
  switch (action) {
    case "promote":
      return `PROMOTE ${name}`;
    case "demote":
      return `TEST ${name}`;
    case "insecure-tls":
      return `ALLOW SELF SIGNED ${name}`;
    case "deploy":
      return environment === "production" ? `DEPLOY PRODUCTION ${name}` : `DEPLOY ${name}`;
  }
}

export function assertConfirmation(typed: unknown, expected: string): void {
  if (normalizeConfirmation(typed) !== normalizeConfirmation(expected))
    throw new ConfirmationError(`Type exactly "${expected}" to confirm this action.`);
}

/**
 * Shared deploy confirmation for the Portal UI and publishPortalToRouter.
 * Uses the same environment rule (any production target → production phrase).
 */
export function portalDeployGate(
  targets: ReadonlyArray<{ name: string; environment?: string | null }>,
): { environment: RouterEnvironment; expected: string } {
  const anyProduction = targets.some((r) => (r.environment ?? "production") !== "test");
  const environment: RouterEnvironment = anyProduction ? "production" : "test";
  assertBatchLimit(targets, environment);
  const label = targets.length === 1 ? (targets[0]?.name ?? "") : "ALL SELECTED";
  return {
    environment,
    expected: expectedConfirmation("deploy", environment, label),
  };
}

export function assertBatchLimit(
  targets: readonly unknown[],
  environment: RouterEnvironment,
): void {
  const max = BATCH_LIMIT[environment];
  if (targets.length === 0) throw new Error("Select at least one router.");
  if (targets.length > max)
    throw new Error(
      environment === "test"
        ? "Test-router actions run against one router at a time."
        : `You can run this against at most ${max} routers at once.`,
    );
}

/**
 * A test router must never be used for production portal/voucher actions until
 * it is explicitly promoted.
 */
export function assertProductionCapable(
  router: { name: string; environment?: string | null },
  action: string,
): void {
  if ((router.environment ?? "production") === "test")
    throw new Error(
      `"${router.name}" is marked as a test router, so ${action} is blocked. Promote it to production first.`,
    );
}

export type ChecklistItem = { id: string; title: string; detail: string };

/** Test Router Setup checklist for an isolated physical MikroTik. */
export const TEST_ROUTER_CHECKLIST: ReadonlyArray<ChecklistItem> = [
  {
    id: "isolated",
    title: "Use an isolated lab router",
    detail:
      "A spare RouterBoard on its own uplink or a lab VLAN. It must not serve paying customers or share a LAN with production devices.",
  },
  {
    id: "credentials",
    title: "Create dedicated test credentials",
    detail:
      "Add a RouterOS API user used only for this test router. Never reuse a production password. Passwords are encrypted and never written to logs or audit records.",
  },
  {
    id: "profile",
    title: "Create a separate hotspot profile",
    detail:
      "Deploy against a test hotspot profile only. Production profiles keep their existing html-directory untouched.",
  },
  {
    id: "vouchers",
    title: "Use fake vouchers only",
    detail: "Issue throwaway codes with no price. Do not sell or hand out test vouchers.",
  },
  {
    id: "portal",
    title: "Point at a non-production portal",
    detail: "Use a test portal directory so a failed deploy cannot affect a live captive portal.",
  },
  {
    id: "transport",
    title: "Prefer the local connector or a restricted tunnel",
    detail:
      "Keep the lab router off the public internet. No port forwarding, no public REST exposure.",
  },
  {
    id: "readonly",
    title: "Run the read-only connection check first",
    detail: "Confirm identity, RouterOS version and reachability before any write is even offered.",
  },
  {
    id: "guarded",
    title: "Then one guarded write at a time",
    detail:
      "Every write needs a typed confirmation, runs against a single target, and is recorded in the operations audit.",
  },
];
