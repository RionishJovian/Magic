import { describe, expect, it } from "vitest";
import {
  planPortalDeploy,
  planPartialRollback,
  planRestorePrior,
  unrestorableAssets,
  type PriorState,
} from "@/lib/portal/deploy-plan";
import {
  assertBatchLimit,
  assertConfirmation,
  assertProductionCapable,
  expectedConfirmation,
  portalDeployGate,
} from "@/lib/test-router";

const profiles = [{ id: "*1", name: "hsprof1", htmlDirectory: "hotspot" }];
const files = [{ name: "login.html", content: "<html>a</html>" }];

describe("portal deployment planning", () => {
  it("stages into a versioned directory and switches only selected profiles at the end", () => {
    const plan = planPortalDeploy({ version: "v1", files, logoUrl: "https://x/l.png", profiles });
    expect(plan.stagingDir).toBe("hotspot-mm-v1");
    expect(plan.creates).toEqual(["hotspot-mm-v1/login.html", "hotspot-mm-v1/img/logo.png"]);
    expect(plan.steps.at(-1)).toMatchObject({
      op: "set-html-dir",
      profileId: "*1",
      previousDir: "hotspot",
    });
    expect(plan.steps.filter((s) => s.op === "set-html-dir")).toHaveLength(1);
    expect(plan.steps.some((s) => s.op === "verify")).toBe(true);
  });

  it("requires at least one profile", () => {
    expect(() => planPortalDeploy({ version: "v1", files, profiles: [] })).toThrow(/at least one/i);
  });

  it("uses exact prebuilt manifest bytes for storage fallback verification", () => {
    const manifestContent =
      '{"version":"v1","fingerprint":"0123456789abcdef","deployedAt":"2026-09-01T00:00:00.000Z"}';
    const plan = planPortalDeploy({
      version: "v1",
      files,
      profiles,
      fingerprint: "0123456789abcdef",
      manifestContent,
    });
    expect(plan.steps).toContainEqual({
      op: "write-text",
      path: "hotspot-mm-v1/mm-manifest.json",
      content: manifestContent,
    });
  });

  it("undoes only completed steps and restores the previous html-directory first", () => {
    const plan = planPortalDeploy({ version: "v1", files, logoUrl: "https://x/l.png", profiles });
    const partial = planPartialRollback(plan, plan.steps.length);
    expect(partial[0]).toMatchObject({ op: "set-html-dir", dir: "hotspot" });
    expect(
      partial.filter((s) => s.op === "remove-file").map((s) => ("path" in s ? s.path : "")),
    ).toEqual(["hotspot-mm-v1/img/logo.png", "hotspot-mm-v1/login.html"]);
    // Failing on the very first write undoes just that write.
    expect(planPartialRollback(plan, 1)).toEqual([
      { op: "remove-file", path: "hotspot-mm-v1/login.html" },
    ]);
    expect(planPartialRollback(plan, 0)).toEqual([]);
  });
});

describe("portal restore of a captured prior state", () => {
  const prior: PriorState = {
    stagingDir: "hotspot-mm-v1",
    texts: [
      { path: "hotspot-mm-v1/login.html", present: true, content: "old" },
      { path: "hotspot-mm-v1/alogin.html", present: false },
    ],
    assets: [
      { path: "hotspot-mm-v1/img/logo.png", present: false },
      { path: "hotspot-mm-v1/img/hero.jpg", present: true },
    ],
    profiles,
    created: ["hotspot-mm-v1/login.html", "hotspot-mm-v1/extra.css"],
  };

  it("restores text, honours absent-file markers and removes newly created files", () => {
    const steps = planRestorePrior(prior);
    expect(steps[0]).toMatchObject({ op: "set-html-dir", dir: "hotspot" });
    expect(steps).toContainEqual({
      op: "write-text",
      path: "hotspot-mm-v1/login.html",
      content: "old",
    });
    expect(steps).toContainEqual({ op: "remove-file", path: "hotspot-mm-v1/alogin.html" });
    expect(steps).toContainEqual({ op: "remove-file", path: "hotspot-mm-v1/img/logo.png" });
    expect(steps).toContainEqual({ op: "remove-file", path: "hotspot-mm-v1/extra.css" });
    // A pre-existing binary is never deleted by a rollback.
    expect(steps).not.toContainEqual({ op: "remove-file", path: "hotspot-mm-v1/img/hero.jpg" });
  });

  it("surfaces binaries that cannot be restored byte-for-byte", () => {
    expect(unrestorableAssets(prior)).toEqual(["hotspot-mm-v1/img/hero.jpg"]);
  });
});

describe("staged rollout gates", () => {
  it("builds distinct confirmation phrases per action and environment", () => {
    expect(expectedConfirmation("promote", "production", "Lab RB")).toBe("PROMOTE LAB RB");
    expect(expectedConfirmation("deploy", "production", "Lab RB")).toBe("DEPLOY PRODUCTION LAB RB");
    expect(expectedConfirmation("deploy", "test", "Lab RB")).toBe("DEPLOY LAB RB");
  });

  it("accepts case/whitespace variants but rejects anything else", () => {
    expect(() => assertConfirmation("  promote   lab rb ", "PROMOTE LAB RB")).not.toThrow();
    expect(() => assertConfirmation("promote lab", "PROMOTE LAB RB")).toThrow(/Type exactly/);
  });

  it("limits test actions to a single router and production to a small batch", () => {
    expect(() => assertBatchLimit([1], "test")).not.toThrow();
    expect(() => assertBatchLimit([1, 2], "test")).toThrow(/one router at a time/);
    expect(() => assertBatchLimit([1, 2, 3, 4, 5], "production")).not.toThrow();
    expect(() => assertBatchLimit([1, 2, 3, 4, 5, 6], "production")).toThrow(/at most 5/);
    expect(() => assertBatchLimit([], "test")).toThrow(/at least one/);
  });

  it("blocks production actions on a test-marked router", () => {
    expect(() =>
      assertProductionCapable({ name: "Lab", environment: "test" }, "publishing"),
    ).toThrow(/test router/i);
    expect(() =>
      assertProductionCapable({ name: "Shop", environment: "production" }, "publishing"),
    ).not.toThrow();
  });

  it("builds the same deploy phrase the Portal UI and server use", () => {
    expect(portalDeployGate([{ name: "Cafe RB", environment: "production" }]).expected).toBe(
      "DEPLOY PRODUCTION CAFE RB",
    );
    expect(portalDeployGate([{ name: "Lab RB5009", environment: "test" }]).expected).toBe(
      "DEPLOY LAB RB5009",
    );
    expect(
      portalDeployGate([
        { name: "A", environment: "test" },
        { name: "B", environment: "production" },
      ]).expected,
    ).toBe("DEPLOY PRODUCTION ALL SELECTED");
  });
});
