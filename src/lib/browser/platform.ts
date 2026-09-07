/**
 * Feature detection helpers. Prefer capability checks and Client Hints over
 * sniffing `navigator.userAgent`.
 */

export type DesktopOs = "windows" | "macos" | "linux";

type NavigatorWithHints = Navigator & {
  userAgentData?: { platform?: string };
  standalone?: boolean;
};

function navigatorHints(): NavigatorWithHints | null {
  if (typeof navigator === "undefined") return null;
  return navigator as NavigatorWithHints;
}

/** Pick the connector installer OS from Client Hints, then `navigator.platform`. */
export function detectDesktopOs(): DesktopOs {
  const nav = navigatorHints();
  if (!nav) return "windows";
  const hint = `${nav.userAgentData?.platform ?? ""} ${nav.platform ?? ""}`;
  if (/mac/i.test(hint)) return "macos";
  if (/linux|x11|cros|chrome os/i.test(hint)) return "linux";
  if (/win/i.test(hint)) return "windows";
  return "windows";
}

/** True when the app is already running as an installed PWA / home-screen icon. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigatorHints();
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    nav?.standalone === true,
  );
}

/**
 * iOS Safari (and other WebKit browsers on iOS) expose `navigator.standalone`
 * and never fire `beforeinstallprompt`. That is a capability check, not a UA
 * parse — use it to show Share → Add to Home Screen instructions.
 */
export function needsLegacyHomeScreenHint(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigatorHints();
  if (!nav) return false;
  if ("onbeforeinstallprompt" in window) return false;
  return "standalone" in nav;
}

export function cssSupports(property: string, value: string): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
  try {
    return CSS.supports(property, value);
  } catch {
    return false;
  }
}
