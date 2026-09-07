import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RouterConn } from "@/lib/mikrotik.server";

const conn = {} as RouterConn;

describe("ensureHotspotTrialAccess with single hotspot profile", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not throw when hotspotProfiles REST returns one object", async () => {
    const patchHotspotProfile = vi.fn(async () => ({}));
    const addUserProfile = vi.fn(async () => ({}));
    vi.doMock("@/lib/mikrotik.server", () => ({
      routerAPI: {
        profiles: vi.fn(async () => []),
        hotspotProfiles: vi.fn(async () => ({ ".id": "*hs1", name: "hsprof-vouchers" })),
        addUserProfile,
        patchUserProfile: vi.fn(),
        patchHotspotProfile,
        execScript: vi.fn(),
      },
    }));

    const { ensureHotspotTrialAccess } = await import("@/lib/portal/trial.server");
    const result = await ensureHotspotTrialAccess(conn, {
      hotspotProfileIds: ["*hs1"],
      trialMinutes: 10,
    });

    expect(result.profilesUpdated).toBe(1);
    expect(patchHotspotProfile).toHaveBeenCalledWith(
      conn,
      "*hs1",
      expect.objectContaining({ "trial-user-profile": "mm-trial" }),
    );
  });
});
