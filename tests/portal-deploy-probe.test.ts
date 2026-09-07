import { describe, expect, it } from "vitest";
import {
  isMagicPortalDirectory,
  magicPortalDirsFromFilePaths,
  portalBundleFingerprint,
} from "@/lib/portal/bundle-fingerprint";
import { assessPortalDeployProbe } from "@/lib/portal/portal-probe.server";

const profiles = [{ id: "*1", name: "hsprof-vouchers", htmlDirectory: "hotspot-mm-v1" }];

describe("portal bundle fingerprint", () => {
  it("is stable for the same files and asset flags", () => {
    const files = [{ name: "login.html", content: "<html/>" }];
    const a = portalBundleFingerprint(files, { logo: true, hero: false });
    const b = portalBundleFingerprint(files, { logo: true, hero: false });
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it("changes when content or assets differ", () => {
    const base = portalBundleFingerprint([{ name: "login.html", content: "a" }], {
      logo: false,
      hero: false,
    });
    const changed = portalBundleFingerprint([{ name: "login.html", content: "b" }], {
      logo: false,
      hero: false,
    });
    const withLogo = portalBundleFingerprint([{ name: "login.html", content: "a" }], {
      logo: true,
      hero: false,
    });
    expect(changed).not.toBe(base);
    expect(withLogo).not.toBe(base);
  });
});

describe("magic portal directory helpers", () => {
  it("recognizes versioned Magic portal dirs", () => {
    expect(isMagicPortalDirectory("hotspot-mm-20260822123045")).toBe(true);
    expect(isMagicPortalDirectory("hotspot")).toBe(false);
    expect(isMagicPortalDirectory("hotspot-mm-v1/extra")).toBe(false);
  });

  it("collects unique dirs from router file paths", () => {
    expect(
      magicPortalDirsFromFilePaths([
        "hotspot-mm-v1/login.html",
        "hotspot-mm-v1/style.css",
        "hotspot-mm-v2/login.html",
        "hotspot/login.html",
      ]),
    ).toEqual(["hotspot-mm-v1", "hotspot-mm-v2"]);
  });
});

describe("assessPortalDeployProbe", () => {
  it("reports not_deployed when no Magic dirs exist", () => {
    const probe = assessPortalDeployProbe({
      profiles: [{ id: "*1", name: "hsprof-vouchers", htmlDirectory: "hotspot" }],
      magicDirectories: [],
      expectedFingerprint: "abc",
      liveFingerprint: null,
      textFilesChecked: 0,
      textFilesMatched: 0,
      assetsExpected: { logo: false, hero: false },
      assetsOnRouter: { logo: false, hero: false },
    });
    expect(probe.status).toBe("not_deployed");
  });

  it("reports matches when fingerprint and assets align", () => {
    const probe = assessPortalDeployProbe({
      profiles,
      magicDirectories: ["hotspot-mm-v1", "hotspot-mm-old"],
      expectedFingerprint: "deadbeef",
      liveFingerprint: "deadbeef",
      textFilesChecked: 3,
      textFilesMatched: 3,
      assetsExpected: { logo: true, hero: false },
      assetsOnRouter: { logo: true, hero: false },
    });
    expect(probe.status).toBe("matches");
    expect(probe.liveDirectory).toBe("hotspot-mm-v1");
    expect(probe.orphanDirectories).toEqual(["hotspot-mm-old"]);
    expect(probe.summary).toMatch(/already live/i);
  });

  it("reports outdated when live content differs", () => {
    const probe = assessPortalDeployProbe({
      profiles,
      magicDirectories: ["hotspot-mm-v1"],
      expectedFingerprint: "newfp",
      liveFingerprint: "oldfp",
      textFilesChecked: 2,
      textFilesMatched: 1,
      assetsExpected: { logo: false, hero: false },
      assetsOnRouter: { logo: false, hero: false },
    });
    expect(probe.status).toBe("outdated");
    expect(probe.summary).toMatch(/outdated/i);
  });

  it("reports partial when profiles disagree", () => {
    const probe = assessPortalDeployProbe({
      profiles: [
        { id: "*1", name: "a", htmlDirectory: "hotspot-mm-v1" },
        { id: "*2", name: "b", htmlDirectory: "hotspot-mm-v2" },
      ],
      magicDirectories: ["hotspot-mm-v1", "hotspot-mm-v2"],
      expectedFingerprint: "abc",
      liveFingerprint: null,
      textFilesChecked: 0,
      textFilesMatched: 0,
      assetsExpected: { logo: false, hero: false },
      assetsOnRouter: { logo: false, hero: false },
    });
    expect(probe.status).toBe("partial");
  });
});
