/**
 * Shared static i18n analysis.
 *
 * Scans `src` for every `t.ui("…")` / `t.copy("…")` call (plus the dynamic
 * navigation labels) and compares the result to the Chinese and Burmese
 * catalogs. Used by `i18n-audit.mjs` (CI gate) and `i18n-sync.mjs` (scaffolder).
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SRC = "src";
const CALL = /\b(?:t|tr)\.(ui|label|action|copy)\(\s*(["'`])((?:\\.|(?!\2)[\s\S])*?)\2/g;
const NAV_LABEL = /\blabel:\s*"([^"]+)"/g;
export const MYANMAR = /[\u1000-\u109F\uAA60-\uAA7F]/;
export const CJK = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
export const TODO_PREFIX = "TODO:";
export const SCRIPT_EXEMPTIONS = new Set([
  "Home",
  "Router",
  "AP",
  "Portal",
  "Syslog",
  "WireGuard",
  "Magic Points",
  "Magic Dude",
  "MikroTik Magic",
  "WAN",
  "Hub",
  "Ai Syslog",
  // Product/protocol names that stay English in every locale.
  "Cloud DDNS",
  "Cloud Remote (DDNS + TLS)",
  "Public IP / DDNS",
  "Cloud Remote",
  "Local Connector",
  "Magic Hub",
  "Option C — Magic Hub",
  "Option A — Public IP / DDNS",
  "Connect via Hub",
  "Magic Hub stuck Offline",
  "CGNAT detected — use Magic Hub or Local Connector",
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if ([".ts", ".tsx"].includes(extname(p))) out.push(p);
  }
  return out;
}

/** All English source strings, grouped by namespace. */
export function collectSourceStrings() {
  const sources = { ui: new Set(), copy: new Set(), action: new Set() };
  for (const file of walk(SRC)) {
    if (file.includes(`i18n${"/"}locales`)) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(CALL)) {
      // `label` is an alias of the translated `ui` namespace; `action` is never translated.
      const ns = m[1] === "label" ? "ui" : m[1];
      sources[ns].add(m[3]);
    }
    // Navigation tabs are translated dynamically via tr.ui(t.label).
    if (file.endsWith("app.tsx")) for (const m of text.matchAll(NAV_LABEL)) sources.ui.add(m[1]);
  }
  return sources;
}

export async function loadDictionaries() {
  const { zh } = await import("../src/lib/i18n/locales/zh.ts");
  const { my } = await import("../src/lib/i18n/locales/my.ts");
  return { zh, my };
}

/**
 * Namespaces every language is expected to translate: feature/tab titles (`ui`)
 * and descriptive copy. Action-button strings live in the `action` namespace and
 * always render in English, so they are never part of coverage.
 */
export function namespacesFor(_lang) {
  return ["ui", "copy"];
}

/**
 * Build the full report:
 * { generatedAt, sourceHash, sourceCounts, languages: { zh: {...}, my: {...} }, violations }
 */
export async function buildReport() {
  const sources = collectSourceStrings();
  const dicts = await loadDictionaries();
  // Stable fingerprint for the strings and dictionaries that make up this report.
  // CI compares it with the committed report so the in-app snapshot cannot go stale.
  const sourceHash = createHash("sha256")
    .update(
      JSON.stringify({
        ui: [...sources.ui].sort(),
        copy: [...sources.copy].sort(),
        action: [...sources.action].sort(),
        dictionaries: dicts,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  const languages = {};
  const violations = [];

  for (const [lang, dict] of Object.entries(dicts)) {
    const script = lang === "my" ? MYANMAR : CJK;
    const missing = [];
    const todo = [];
    const wrongScript = [];
    let translated = 0;
    let total = 0;

    for (const ns of namespacesFor(lang)) {
      for (const src of sources[ns]) {
        total++;
        const value = dict[ns][src];
        if (!value) {
          missing.push({ ns, key: src });
          violations.push({ lang, rule: "missing", detail: `${ns}: ${src}` });
          continue;
        }
        if (value.startsWith(TODO_PREFIX)) {
          todo.push({ ns, key: src });
          violations.push({ lang, rule: "todo", detail: `${ns}: ${src}` });
          continue;
        }
        translated++;
        if (!script.test(value) && !SCRIPT_EXEMPTIONS.has(src)) {
          wrongScript.push({ ns, key: src, value });
          violations.push({
            lang,
            rule: "wrong-script",
            detail: `${ns}: ${src}`,
          });
        }
      }
    }

    const unused = [];
    for (const ns of ["ui", "copy"]) {
      for (const key of Object.keys(dict[ns])) {
        if (!sources[ns].has(key)) unused.push({ ns, key });
      }
    }

    // Action buttons must stay English in every language.
    const actionEntries = [];
    for (const ns of ["ui", "copy"]) {
      for (const key of Object.keys(dict[ns])) {
        if (sources.action.has(key)) actionEntries.push(key);
      }
    }
    if (actionEntries.length > 0) {
      violations.push({
        lang,
        rule: "action-entry",
        detail: `Action buttons must stay English: ${actionEntries.join(", ")}`,
      });
    }

    languages[lang] = {
      total,
      translated,
      // Keep two decimals. Rounding 420/421 to 100 used to let an untranslated
      // string pass a nominally 100% CI gate.
      coverage: total === 0 ? 100 : Math.round((translated / total) * 10_000) / 100,
      missing,
      todo,
      wrongScript,
      unused,
      actionEntries,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceHash,
    sourceCounts: {
      ui: sources.ui.size,
      copy: sources.copy.size,
      action: sources.action.size,
    },
    languages,
    violations,
  };
}
