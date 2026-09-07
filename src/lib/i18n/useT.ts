import { useMemo } from "react";
import { DICTIONARIES, type LanguageCode } from "./dictionaries";
import { useLanguage } from "./context";

export type Vars = Record<string, string | number>;

export type Translator = {
  label: (english: string, vars?: Vars) => string;
  ui: (english: string, vars?: Vars) => string;
  action: (english: string, vars?: Vars) => string;
  copy: (english: string, vars?: Vars) => string;
  lang: LanguageCode;
};

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function useT(): Translator {
  const { lang } = useLanguage();
  return useMemo(() => {
    const dictionary = DICTIONARIES[lang];
    const label = (english: string, vars?: Vars) =>
      interpolate(dictionary.ui[english] ?? english, vars);
    return {
      lang,
      label,
      ui: label,
      action: (english: string, vars?: Vars) => interpolate(english, vars),
      copy: (english: string, vars?: Vars) =>
        interpolate(dictionary.copy[english] ?? english, vars),
    };
  }, [lang]);
}
