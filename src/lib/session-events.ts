export const SESSION_EXPIRED_EVENT = "mm:session-expired";

let pendingSessionExpiry = false;

/** Notify the app that an authenticated request was rejected. */
export function notifySessionExpired() {
  // This function is only called by the browser auth middleware. Set the
  // signal before dispatching so it also works when no listener is mounted.
  pendingSessionExpiry = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}

/** Consume an expiry signal that may have been emitted before the guard mounted. */
export function consumeSessionExpired(): boolean {
  const pending = pendingSessionExpiry;
  pendingSessionExpiry = false;
  return pending;
}

/** Clear an expiry signal after a new valid session is established. */
export function clearSessionExpired() {
  pendingSessionExpiry = false;
}

/** Keep router/device errors from being mistaken for an app-session failure. */
export function isUnauthorizedSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  if (candidate.status !== undefined || candidate.statusCode !== undefined) {
    return candidate.status === 401 || candidate.statusCode === 401;
  }
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return /^(?:unauthorized|session expired)(?::|$)/i.test(message);
}
