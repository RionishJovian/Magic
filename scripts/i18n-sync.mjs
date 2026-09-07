#!/usr/bin/env node
/**
 * Scaffold missing translation entries.
 *
 *   bun run i18n:sync            add `TODO: <english>` entries to zh.ts / my.ts
 *   bun run i18n:sync --dry-run  show what would change
 *
 * Also writes `i18n-checklist.md` — the review list for translators. Entries
 * are inserted with a TODO prefix so the audit keeps counting them as
 * untranslated until a human replaces them.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  collectSourceStrings,
  loadDictionaries,
  namespacesFor,
  TODO_PREFIX,
} from "./i18n-core.mjs";

const dry = process.argv.includes("--dry-run");
const LOCALE = (lang) => `src/lib/i18n/locales/${lang}.ts`;
const CHECKLIST = "i18n-checklist.md";

const sources = collectSourceStrings();
const dicts = await loadDictionaries();

/** Escape a string for a double-quoted TS literal. */
const lit = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Insert entries at the top of the `ns: {` object literal in a locale file. */
function insertEntries(text, ns, entries) {
  const marker = new RegExp(`(\\n\\s*${ns}:\\s*\\{)`);
  if (!marker.test(text)) throw new Error(`Could not find "${ns}" block`);
  const block = entries
    .map((k) => `\n    // needs translation\n    ${lit(k)}: ${lit(`${TODO_PREFIX} ${k}`)},`)
    .join("");
  return text.replace(marker, `$1${block}`);
}

const checklist = [
  "# Translation checklist",
  "",
  `Generated ${new Date().toISOString()} by \`bun run i18n:sync\`.`,
  "",
  "Replace every `TODO: …` value in the locale files, then run `bun run i18n:audit`.",
  "Action buttons stay English in every language; feature titles and copy are translated.",
  "",
];

let changedAny = false;

for (const [lang, dict] of Object.entries(dicts)) {
  let text = readFileSync(LOCALE(lang), "utf8");
  const added = { ui: [], copy: [] };

  for (const ns of namespacesFor(lang)) {
    for (const key of sources[ns]) {
      if (dict[ns][key]) continue;
      added[ns].push(key);
    }
  }

  const totalAdded = added.ui.length + added.copy.length;
  const pending = [];
  for (const ns of namespacesFor(lang)) {
    for (const [key, value] of Object.entries(dict[ns])) {
      if (typeof value === "string" && value.startsWith(TODO_PREFIX)) pending.push({ ns, key });
    }
  }

  checklist.push(`## ${lang.toUpperCase()}`, "");
  if (!totalAdded && !pending.length) {
    checklist.push("Nothing to review — every source string is translated.", "");
  } else {
    for (const ns of ["ui", "copy"]) {
      const rows = [
        ...added[ns].map((key) => ({ key, state: "new" })),
        ...pending.filter((p) => p.ns === ns).map((p) => ({ key: p.key, state: "pending" })),
      ];
      if (!rows.length) continue;
      checklist.push(`### ${ns}`, "");
      for (const r of rows) checklist.push(`- [ ] (${r.state}) ${r.key}`);
      checklist.push("");
    }
  }

  if (totalAdded) {
    changedAny = true;
    for (const ns of ["ui", "copy"]) {
      if (added[ns].length) text = insertEntries(text, ns, added[ns]);
    }
    if (!dry) writeFileSync(LOCALE(lang), text);
  }

  console.log(
    `${lang.toUpperCase()}: ${totalAdded} new placeholder(s), ${pending.length} still marked ${TODO_PREFIX}`,
  );
}

if (!dry) writeFileSync(CHECKLIST, `${checklist.join("\n").trimEnd()}\n`);
console.log(
  dry
    ? "Dry run — no files written."
    : `${changedAny ? "Locale files updated. " : ""}Checklist written to ${CHECKLIST}`,
);
