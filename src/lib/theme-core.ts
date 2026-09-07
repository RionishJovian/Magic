import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "@/lib/elegant-natural";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";
export const STORAGE_KEY = "mm.theme";

function systemPrefersDark() {
  return typeof window === "undefined" || window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark() ? "dark" : "light") : preference;
}

export function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
}

export function readStoredTheme(): ThemePreference {
  try {
    if (typeof window !== "undefined") {
      const queryTheme = new URLSearchParams(window.location.search).get("theme");
      if (queryTheme === "light" || queryTheme === "dark" || queryTheme === "system")
        return queryTheme;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
  } catch {
    return "dark";
  }
}

export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(STORAGE_KEY)};var q=new URLSearchParams(location.search).get("theme");var t=(q==="light"||q==="dark"||q==="system")?q:(localStorage.getItem(k)||"dark");if(q==="light"||q==="dark"||q==="system"){try{localStorage.setItem(k,q)}catch(e){}}var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme:dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}})();`;
