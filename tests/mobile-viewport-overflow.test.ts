import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderErrorPage } from "@/lib/error-page";
import { VIEWPORT_CONTENT, VIEWPORT_META_TAG } from "@/lib/viewport";

describe("mobile viewport + overflow guards", () => {
  it("exports a device-width viewport with safe-area + keyboard resizing", () => {
    expect(VIEWPORT_CONTENT).toContain("width=device-width");
    expect(VIEWPORT_CONTENT).toContain("initial-scale=1");
    expect(VIEWPORT_CONTENT).toContain("viewport-fit=cover");
    expect(VIEWPORT_CONTENT).toContain("interactive-widget=resizes-content");
    expect(VIEWPORT_CONTENT).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/i);
    expect(VIEWPORT_META_TAG).toContain(`content="${VIEWPORT_CONTENT}"`);
  });

  it("wires the viewport constant into the TanStack root head", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).toMatch(/from\s+["']@\/lib\/viewport["']/);
    expect(root).toMatch(/name:\s*["']viewport["'][\s\S]*content:\s*VIEWPORT_CONTENT/);
  });

  it("applies the same viewport to error + portal HTML shells", () => {
    expect(renderErrorPage()).toContain(VIEWPORT_META_TAG);

    const portal = readFileSync("src/lib/portal-template.server.ts", "utf8");
    expect(portal).toMatch(/VIEWPORT_CONTENT/);
    expect(portal).toMatch(/content="\$\{VIEWPORT_CONTENT\}"/);

    const guest = readFileSync("src/lib/portal/guest-pages.server.ts", "utf8");
    expect(guest).toMatch(/VIEWPORT_CONTENT/);
    expect(guest).toMatch(/content="\$\{VIEWPORT_CONTENT\}"/);
  });

  it("keeps root overflow clipping and mobile shrink/scroll utilities", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/overflow-x:\s*clip/);
    expect(css).toMatch(/box-sizing:\s*border-box/);
    expect(css).toMatch(/body\s*>\s*\*\s*\{[\s\S]*min-width:\s*0/);
    expect(css).toMatch(/@utility\s+table-scroll/);
    expect(css).toMatch(/@utility\s+container-page\s*\{[\s\S]*min-width:\s*0/);
    expect(css).toMatch(/\.overflow-x-auto\s*>\s*table[\s\S]*max-width:\s*none/);
  });

  it("pins the mobile tab dock to safe-area (no lvh−svh Safari lift)", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const nav = readFileSync("src/components/AppBottomNav.tsx", "utf8");
    const shell = readFileSync("src/routes/_authenticated/app.tsx", "utf8");
    expect(css).toMatch(
      /\.app-tab-bar\s*\{[\s\S]*bottom:\s*calc\(0\.5rem \+ env\(safe-area-inset-bottom/,
    );
    expect(css).not.toMatch(/100lvh - 100svh/);
    expect(css).toMatch(/@utility\s+app-shell-pad/);
    expect(nav).toContain('className="app-tab-bar fixed z-40 md:hidden"');
    expect(nav).not.toMatch(/inset-x-0 bottom-0/);
    expect(shell).toContain("app-shell-pad");
  });

  it("avoids fixed w-80 toast columns that overflow narrow phones", () => {
    const notice = readFileSync("src/components/InAppNotice.tsx", "utf8");
    const bell = readFileSync("src/components/NotificationsBell.tsx", "utf8");
    expect(notice).toMatch(/max-w-sm/);
    expect(notice).not.toMatch(/fixed right-4 top-4 z-50 flex w-80/);
    expect(bell).toMatch(/max-w-sm/);
    expect(bell).toMatch(/sm:w-80/);
    expect(bell).not.toMatch(/fixed right-4 top-4 z-50 flex w-80/);
  });
});
