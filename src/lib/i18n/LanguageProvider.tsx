import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LanguageCode } from "./dictionaries";
import { LanguageContext } from "./context";
import { isLanguage, readStoredLanguage, STORAGE_KEY } from "./language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Keep the first server and client render identical. Browser storage is
  // loaded after hydration to avoid translated-markup hydration mismatches.
  const [lang, setLangState] = useState<LanguageCode>("en");

  useEffect(() => {
    setLangState(readStoredLanguage());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-lang", lang);
    document.documentElement.setAttribute(
      "lang",
      lang === "zh" ? "zh-Hans" : lang === "my" ? "my" : "en",
    );
  }, [lang]);

  const setLang = useCallback((language: LanguageCode) => {
    setLangState(language);
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore unavailable storage.
    }
  }, []);

  const hydrateFromServer = useCallback((language: LanguageCode) => {
    let cached: string | null = null;
    try {
      cached = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Ignore unavailable storage.
    }
    if (!isLanguage(cached)) setLangState(language);
  }, []);

  const value = useMemo(
    () => ({ lang, setLang, hydrateFromServer }),
    [lang, setLang, hydrateFromServer],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
