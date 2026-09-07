/**
 * Router setup state machine.
 *
 * The MVP supports exactly these six states — nothing else may be reported.
 */

export const ROUTER_STATES = [
  "discovered",
  "authenticating",
  "configuring",
  "connected",
  "offline",
  "error",
];

/** Allowed forward transitions. `error` and `offline` are always reachable. */
const TRANSITIONS = {
  discovered: ["authenticating", "offline", "error"],
  authenticating: ["configuring", "connected", "discovered", "offline", "error"],
  configuring: ["connected", "offline", "error"],
  connected: ["configuring", "authenticating", "offline", "error"],
  offline: ["discovered", "authenticating", "connected", "error"],
  error: ["discovered", "authenticating", "configuring", "offline"],
};

export function isRouterState(value) {
  return typeof value === "string" && ROUTER_STATES.includes(value);
}

export function canTransition(from, to) {
  if (!isRouterState(from) || !isRouterState(to)) return false;
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function transition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal router state transition: ${from} -> ${to}`);
  }
  return to;
}
