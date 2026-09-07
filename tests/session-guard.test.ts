import { describe, expect, it } from "vitest";
import { classifyForcedSignOut, forcedSignOutMessage } from "@/lib/session-guard";

describe("classifyForcedSignOut", () => {
  const now = 1_700_000_000;

  it("treats TOKEN_REFRESHED with a cleared session as expiry, never remote", () => {
    expect(
      classifyForcedSignOut({
        event: "TOKEN_REFRESHED",
        previousExpiresAt: now + 3600,
        nowSec: now,
      }),
    ).toBe("expired");
  });

  it("treats SIGNED_OUT near or past access-token expiry as expiry", () => {
    expect(
      classifyForcedSignOut({
        event: "SIGNED_OUT",
        previousExpiresAt: now + 30,
        nowSec: now,
      }),
    ).toBe("expired");
    expect(
      classifyForcedSignOut({
        event: "SIGNED_OUT",
        previousExpiresAt: now - 10,
        nowSec: now,
      }),
    ).toBe("expired");
  });

  it("treats SIGNED_OUT with plenty of token life left as a remote revoke", () => {
    expect(
      classifyForcedSignOut({
        event: "SIGNED_OUT",
        previousExpiresAt: now + 1800,
        nowSec: now,
      }),
    ).toBe("remote");
  });

  it("uses a neutral reason when we never saw an expires_at", () => {
    expect(
      classifyForcedSignOut({
        event: "SIGNED_OUT",
        previousExpiresAt: null,
        nowSec: now,
      }),
    ).toBe("ended");
  });
});

describe("forcedSignOutMessage", () => {
  it("keeps the remote-revoke copy for true remote cases only", () => {
    expect(forcedSignOutMessage("remote")).toMatch(/another device/);
    expect(forcedSignOutMessage("expired")).toMatch(/expired/i);
    expect(forcedSignOutMessage("ended")).toMatch(/ended/i);
    expect(forcedSignOutMessage("expired")).not.toMatch(/another device/);
  });
});
