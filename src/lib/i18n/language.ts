import type { LanguageCode } from "./dictionaries";

export const STORAGE_KEY = "mm.language";

export function isLanguage(value: unknown): value is LanguageCode {
  return value === "en" || value === "zh" || value === "my";
}

export function readStoredLanguage(): LanguageCode {
  if (typeof window === "undefined") return "en";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(raw) ? raw : "en";
  } catch {
    return "en";
  }
}
