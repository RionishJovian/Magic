import { describe, expect, it } from "vitest";
import {
  clearSessionExpired,
  consumeSessionExpired,
  isUnauthorizedSessionError,
  notifySessionExpired,
} from "@/lib/session-events";

describe("isUnauthorizedSessionError", () => {
  it("recognizes auth guard errors and 401-shaped errors", () => {
    expect(isUnauthorizedSessionError(new Error("Unauthorized: Invalid token"))).toBe(true);
    expect(isUnauthorizedSessionError({ statusCode: 401, message: "Request failed" })).toBe(true);
    expect(isUnauthorizedSessionError(new Error("Session expired: sign in again"))).toBe(true);
  });

  it("does not sign out for RouterOS or unrelated errors", () => {
    expect(isUnauthorizedSessionError(new Error("RouterOS 401 Unauthorized"))).toBe(false);
    expect(isUnauthorizedSessionError(new Error("Network unavailable"))).toBe(false);
    expect(isUnauthorizedSessionError({ status: 500, message: "Unauthorized" })).toBe(false);
  });
});

describe("session expiry signal", () => {
  it("can be consumed when the guard subscribes after the event was emitted", () => {
    clearSessionExpired();
    notifySessionExpired();
    expect(consumeSessionExpired()).toBe(true);
    expect(consumeSessionExpired()).toBe(false);
  });

  it("clears a stale signal after a valid session is restored", () => {
    clearSessionExpired();
    notifySessionExpired();
    clearSessionExpired();
    expect(consumeSessionExpired()).toBe(false);
  });
});
