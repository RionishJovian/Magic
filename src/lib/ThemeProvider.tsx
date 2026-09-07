import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ThemeContext } from "./theme-context";
import {
  applyThemeClass,
  readStoredTheme,
  resolveTheme,
  STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme-core";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window === "undefined" ? "dark" : readStoredTheme(),
  );
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    typeof window === "undefined" ? "dark" : resolveTheme(readStoredTheme()),
  );

  useEffect(() => {
    const preference = readStoredTheme();
    setPreferenceState(preference);
    const resolved = resolveTheme(preference);
    setResolved(resolved);
    applyThemeClass(resolved);
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = resolveTheme("system");
      setResolved(resolved);
      applyThemeClass(resolved);
    };
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore unavailable storage.
    }
    const resolved = resolveTheme(next);
    setResolved(resolved);
    applyThemeClass(resolved);
  }, []);

  const toggle = useCallback(
    () => setPreference(resolved === "dark" ? "light" : "dark"),
    [resolved, setPreference],
  );
  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
