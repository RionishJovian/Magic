import type { Dict, LanguageCode } from "./types";
import { zh } from "./locales/zh";
import { my } from "./locales/my";

export { LANGUAGES } from "./types";
export type { Dict, LanguageCode } from "./types";

export const DICTIONARIES: Record<LanguageCode, Dict> = {
  en: { ui: {}, copy: {} },
  zh,
  my,
};
