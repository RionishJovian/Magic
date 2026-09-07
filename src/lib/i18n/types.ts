export type LanguageCode = "en" | "zh" | "my";

/**
 * `ui`   — feature/tab and section titles (translated in every language).
 * Action buttons use `t.action(...)` and are never stored in a catalog.
 * `copy` — descriptions, helper text, empty states, toasts.
 *
 * Keys are the English source strings, so a missing entry renders in English
 * instead of a raw key or a broken glyph.
 */
export type Dict = { ui: Record<string, string>; copy: Record<string, string> };

export const LANGUAGES: Array<{ code: LanguageCode; label: string; native: string }> = [
  { code: "en", label: "English", native: "English" },
  { code: "zh", label: "Chinese (Simplified)", native: "简体中文" },
  { code: "my", label: "Burmese (Unicode)", native: "မြန်မာ" },
];
