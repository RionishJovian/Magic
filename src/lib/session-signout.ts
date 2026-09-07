// Shared flag so the session guard can tell a user-initiated sign-out apart
// from a session revoked elsewhere (e.g. sign-in on another device).
//
// The flag is one-time: consuming it resets it, so a later forced invalidation
// in the same SPA runtime is still handled.
let intentional = false;

/** Call right before a user-initiated sign-out. */
export function markIntentionalSignOut() {
  intentional = true;
}

/** Reads and clears the flag. Returns true only for the deliberate sign-out. */
export function consumeIntentionalSignOut() {
  const was = intentional;
  intentional = false;
  return was;
}

/** Test helper: clears any pending flag. */
export function resetIntentionalSignOut() {
  intentional = false;
}
