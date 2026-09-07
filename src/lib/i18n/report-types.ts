/** Shape of the report emitted by `bun run i18n:audit`. */
export type I18nEntryRef = { ns: "ui" | "copy"; key: string; value?: string };

export type I18nLanguageReport = {
  total: number;
  translated: number;
  coverage: number;
  missing: I18nEntryRef[];
  todo: I18nEntryRef[];
  wrongScript: I18nEntryRef[];
  unused: I18nEntryRef[];
  /** Action-button strings that must never be translated but appear in a catalog. */
  actionEntries: string[];
};

export type I18nViolation = { lang: string; rule: string; detail: string };

export type I18nReport = {
  generatedAt: string;
  /** Stable fingerprint of rendered source strings and locale dictionaries. */
  sourceHash: string;
  sourceCounts: { ui: number; copy: number; action?: number };
  languages: Record<string, I18nLanguageReport>;
  violations: I18nViolation[];
};
