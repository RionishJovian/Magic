import { describe, expect, it } from "vitest";
import { CLOUD_PEER_FRESHNESS_MS, cloudPeerStatusFromHandshake } from "@/lib/cloud-peer-status";

describe("Magic Hub peer freshness", () => {
  const now = Date.parse("2026-09-01T02:00:00.000Z");

  it("treats a recent handshake as online", () => {
    expect(cloudPeerStatusFromHandshake("enabled", "2026-09-01T01:58:00.000Z", now)).toBe("online");
  });

  it("does not call an hours-old handshake online", () => {
    expect(cloudPeerStatusFromHandshake("enabled", "2026-08-31T22:00:00.000Z", now)).toBe(
      "offline",
    );
  });

  it("uses a five-minute freshness boundary", () => {
    const boundary = new Date(now - CLOUD_PEER_FRESHNESS_MS).toISOString();
    expect(cloudPeerStatusFromHandshake("enabled", boundary, now)).toBe("online");
  });

  it("distinguishes connecting, invalid, and disabled peers", () => {
    expect(cloudPeerStatusFromHandshake("enabled", null, now)).toBe("connecting");
    expect(cloudPeerStatusFromHandshake("enabled", "not-a-date", now)).toBe("error");
    expect(cloudPeerStatusFromHandshake("disabled", "2026-09-01T01:59:00.000Z", now)).toBe("error");
  });
});
