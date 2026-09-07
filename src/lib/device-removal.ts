import { assertConfirmation, normalizeConfirmation } from "./test-router";

/** Exact phrases the operator must type for destructive, already-bound removals. */
export const REMOVE_DEVICE_PHRASE = "CONFIRM REMOVING THE DEVICE";
export const REMOVE_PLANS_PHRASE = "CONFIRM REMOVING THE PLANS";
export const DELETE_SITE_PHRASE = "CONFIRM DELETING THE SITE";

export function matchesTypedConfirmation(typed: string, phrase: string): boolean {
  return normalizeConfirmation(typed) === normalizeConfirmation(phrase);
}

export function assertTypedConfirmation(typed: unknown, phrase: string): void {
  assertConfirmation(typed, phrase);
}

export function matchesRemoveDeviceConfirmation(typed: string): boolean {
  return matchesTypedConfirmation(typed, REMOVE_DEVICE_PHRASE);
}

export function assertRemoveDeviceConfirmation(typed: unknown): void {
  assertTypedConfirmation(typed, REMOVE_DEVICE_PHRASE);
}

export function siteNeedsTypedDeletion(boundCount: number): boolean {
  return boundCount > 0;
}

/**
 * Live Magic Hub / currently-online routers need typed removal.
 * Sandbox lab devices keep the simpler confirm on their own page.
 */
export function routerNeedsTypedRemoval(input: {
  connectionMode?: string | null;
  online?: boolean | null;
  cloudPeerId?: string | null;
}): boolean {
  if (input.connectionMode === "sandbox") return false;
  if (input.online) return true;
  if (input.cloudPeerId) return true;
  return input.connectionMode === "hub" || input.connectionMode === "cloud";
}
