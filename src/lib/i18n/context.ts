import { createContext, useContext } from "react";
import type { LanguageCode } from "./dictionaries";

export type LanguageContextValue = {
  lang: LanguageCode;
  setLang: (language: LanguageCode) => void;
  hydrateFromServer: (language: LanguageCode) => void;
};

export const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
  hydrateFromServer: () => {},
});

export function useLanguage() {
  return useContext(LanguageContext);
}
