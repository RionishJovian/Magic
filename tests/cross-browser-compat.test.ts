/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "@/lib/browser/clipboard";
import {
  detectDesktopOs,
  isStandaloneDisplay,
  needsLegacyHomeScreenHint,
} from "@/lib/browser/platform";
import { createMemoryStorage, getSafeLocalStorage } from "@/lib/browser/storage";

describe("evergreen browser targets (no ES5 polyfill stack)", () => {
  it("pins Lightning CSS / Vite targets via browserslist", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      browserslist?: string[];
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.browserslist).toEqual(
      expect.arrayContaining([
        "chrome >= 109",
        "firefox >= 115",
        "safari >= 16",
        "ios >= 16",
        "edge >= 109",
      ]),
    );
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["core-js"]).toBeUndefined();
    expect(deps.modernizr).toBeUndefined();
    expect(deps.autoprefixer).toBeUndefined();
  });
});

describe("normalize + vendor prefixes at the asset layer", () => {
  it("applies border-box, tap highlight, and text-size-adjust at the root", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[\s\S]*box-sizing:\s*border-box/);
    expect(css).toMatch(/-webkit-text-size-adjust:\s*100%/);
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
    expect(css).toMatch(/-moz-osx-font-smoothing:\s*grayscale/);
    expect(css).toMatch(/overflow-x:\s*hidden/);
    expect(css).toMatch(/overflow-x:\s*clip/);
  });

  it("pairs every dashboard backdrop-filter with the WebKit prefix and an @supports fallback", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const lines = css.split("\n");
    let backdrop = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim().startsWith("backdrop-filter:")) continue;
      backdrop += 1;
      // Prettier may wrap the prefixed declaration across several lines.
      expect(lines.slice(Math.max(0, i - 3), i).join("\n")).toMatch(/-webkit-backdrop-filter:/);
    }
    expect(backdrop).toBeGreaterThan(8);
    expect(css).toMatch(
      /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/,
    );
  });

  it("prefixes glass blur on the captive-portal stylesheet (not processed by Vite)", () => {
    const portal = readFileSync("src/lib/portal-template.server.ts", "utf8");
    expect(portal).toMatch(/box-sizing:border-box/);
    expect(portal).toMatch(/-webkit-backdrop-filter:blur\(28px\)/);
    expect(portal).toMatch(/-webkit-appearance:none/);
    expect(portal).toMatch(/min-height:100dvh/);
    expect(portal).toMatch(/@supports not \(\(backdrop-filter:blur\(1px\)\)/);
  });
});

describe("safe storage + clipboard feature detection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls back to memory when localStorage throws (Safari private mode)", () => {
    const throwing = {
      getItem: () => {
        throw new Error("quota");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("quota");
      },
      clear: () => undefined,
      key: () => null,
      length: 0,
    } as Storage;
    vi.stubGlobal("window", { localStorage: throwing });
    const store = getSafeLocalStorage();
    store.setItem("mm.theme", "dark");
    expect(store.getItem("mm.theme")).toBe("dark");
  });

  it("memory storage round-trips like Web Storage", () => {
    const store = createMemoryStorage();
    expect(store.getItem("x")).toBeNull();
    store.setItem("x", "1");
    expect(store.getItem("x")).toBe("1");
    expect(store.length).toBe(1);
    store.removeItem("x");
    expect(store.getItem("x")).toBeNull();
  });

  it("uses the Clipboard API when it is present", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("abc")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("abc");
  });

  it("falls back to execCommand when Clipboard API is missing", async () => {
    vi.stubGlobal("navigator", {});
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: exec,
    });
    await expect(copyText("voucher")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });
});

describe("install + OS hints use capabilities, not UA strings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads desktop OS from Client Hints / platform, not userAgent", () => {
    vi.stubGlobal("navigator", {
      userAgentData: { platform: "macOS" },
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    expect(detectDesktopOs()).toBe("macos");
    const wizard = readFileSync("src/components/ConnectorWizard.tsx", "utf8");
    const install = readFileSync("src/components/InstallAppCard.tsx", "utf8");
    expect(wizard).not.toMatch(/navigator\.userAgent/);
    expect(install).not.toMatch(/userAgent/);
    expect(install).toMatch(/needsLegacyHomeScreenHint/);
  });

  it("treats navigator.standalone as the iOS home-screen capability", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal("navigator", { standalone: false });
    expect(isStandaloneDisplay()).toBe(false);
    expect(needsLegacyHomeScreenHint()).toBe(true);
  });
});

describe("PWA asset service worker policy", () => {
  it("only caches hashed /assets/* and never HTML navigations", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toContain('pathname.startsWith("/assets/")');
    expect(sw).toContain('req.mode === "navigate"');
    expect(sw).toContain("skipWaiting");
    expect(sw).not.toMatch(/cache\.addAll\(\s*["']\/["']/);
    expect(readFileSync("src/routes/__root.tsx", "utf8")).toMatch(/registerAssetServiceWorker/);
    expect(readFileSync("src/lib/browser/register-sw.ts", "utf8")).toMatch(
      /import\.meta\.env\.DEV/,
    );
  });

  it("serves sw.js with no-cache so updates are not stuck", () => {
    const headers = readFileSync("public/_headers", "utf8");
    expect(headers).toMatch(/\/sw\.js[\s\S]*Cache-Control:\s*no-cache/);
    expect(isFingerprintedFromHeaders()).toBe(true);
  });
});

function isFingerprintedFromHeaders(): boolean {
  const headers = readFileSync("public/_headers", "utf8");
  return /\/assets\/\*[\s\S]*max-age=31536000/.test(headers);
}
