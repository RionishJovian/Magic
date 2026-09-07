import { describe, expect, it, beforeEach } from "vitest";
import {
  consumeIntentionalSignOut,
  markIntentionalSignOut,
  resetIntentionalSignOut,
} from "@/lib/session-signout";

describe("intentional sign-out flag", () => {
  beforeEach(() => resetIntentionalSignOut());

  it("is false by default", () => {
    expect(consumeIntentionalSignOut()).toBe(false);
  });

  it("is one-time consumable", () => {
    markIntentionalSignOut();
    expect(consumeIntentionalSignOut()).toBe(true);
    // A later forced invalidation must NOT be suppressed.
    expect(consumeIntentionalSignOut()).toBe(false);
  });

  it("can be re-armed for a second deliberate sign-out", () => {
    markIntentionalSignOut();
    consumeIntentionalSignOut();
    markIntentionalSignOut();
    expect(consumeIntentionalSignOut()).toBe(true);
  });
});
