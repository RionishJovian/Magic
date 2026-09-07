/**
 * Builds the single-file local setup tool that is served from
 * /api/public/connector/setup-tool.
 *
 * The agent modules are plain ESM with `node:` imports and relative `./lib/*`
 * imports. Concatenating them naively produces duplicate binding names (two
 * `writeFileSync` imports, for example), which is a SyntaxError. This module
 * therefore:
 *   1. removes every relative import,
 *   2. lifts all `node:` imports out of the bodies and merges them into one
 *      deduplicated import block at the top of the bundle,
 *   3. drops the `export` keyword so nothing is re-declared or exported.
 */

type Collected = {
  /** module specifier -> named bindings (`local` keeps any `as` alias) */
  named: Map<string, Set<string>>;
  /** module specifier -> default binding names */
  defaults: Map<string, Set<string>>;
  /** side-effect only imports */
  bare: Set<string>;
};

const IMPORT_RE = /^import\s+([\s\S]*?)\s*from\s*["']([^"']+)["'];?[ \t]*$/gm;
const BARE_IMPORT_RE = /^import\s*["']([^"']+)["'];?[ \t]*$/gm;

function isRelative(spec: string): boolean {
  return spec.startsWith(".") || spec.startsWith("/");
}

function collect(source: string, into: Collected): string {
  let out = source.replace(BARE_IMPORT_RE, (match, spec: string) => {
    if (isRelative(spec)) return "";
    into.bare.add(spec);
    return "";
  });

  out = out.replace(IMPORT_RE, (match, clauseRaw: string, spec: string) => {
    if (isRelative(spec)) return "";
    const clause = clauseRaw.trim();
    const braceStart = clause.indexOf("{");
    const head = (braceStart === -1 ? clause : clause.slice(0, braceStart))
      .replace(/,\s*$/, "")
      .trim();
    if (head) {
      if (!into.defaults.has(spec)) into.defaults.set(spec, new Set());
      into.defaults.get(spec)!.add(head);
    }
    if (braceStart !== -1) {
      const braceEnd = clause.lastIndexOf("}");
      const names = clause
        .slice(braceStart + 1, braceEnd)
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      if (!into.named.has(spec)) into.named.set(spec, new Set());
      for (const n of names) into.named.get(spec)!.add(n);
    }
    return "";
  });

  return out;
}

function stripExports(source: string): string {
  return source
    .replace(/^#!.*\n/, "")
    .replace(/^export\s+(?=(const|function|class|async|let|var))/gm, "")
    .replace(/^export\s*\{[^}]*\};?[ \t]*$/gm, "");
}

function renderImports(c: Collected): string {
  const lines: string[] = [];
  for (const spec of c.bare) lines.push(`import ${JSON.stringify(spec)};`);
  const specs = new Set([...c.defaults.keys(), ...c.named.keys()]);
  for (const spec of specs) {
    const def = [...(c.defaults.get(spec) ?? [])];
    const named = [...(c.named.get(spec) ?? [])].sort();
    const parts: string[] = [];
    if (def.length) parts.push(def[0]!);
    if (named.length) parts.push(`{ ${named.join(", ")} }`);
    lines.push(`import ${parts.join(", ")} from ${JSON.stringify(spec)};`);
  }
  return lines.sort().join("\n");
}

/** Concatenate agent modules (dependency order) into one runnable file. */
export function buildSetupBundle(
  modules: string[],
  header: string[] = [
    "// MikroMagic Connector — local router setup tool (generated bundle).",
    "// Router credentials typed into this tool never leave the machine it runs on.",
  ],
): string {
  const collected: Collected = { named: new Map(), defaults: new Map(), bare: new Set() };
  const bodies = modules.map((m) => stripExports(collect(m, collected)).trim());

  return [
    "#!/usr/bin/env node",
    ...header,
    "// Used only by the Connector Agent entrypoint; harmless for setup bundles.",
    "globalThis.__MIKROMAGIC_BUNDLED_AGENT__ = true;",
    renderImports(collected),
    ...bodies,
    "",
  ].join("\n\n");
}
