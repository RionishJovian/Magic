// Deterministic tagging so every rule this app creates is recognisable and
// re-applying an unchanged intent produces skips instead of duplicates.
//
//   mmagic:<intent>:<hash>
//
// The hash covers only the fields that define the rule, so an unchanged intent
// always yields the same tag on every device and every replan.

const TAG_PREFIX = "mmagic";

/** FNV-1a 32-bit — stable, dependency-free, and identical on server + client. */
export function stableHash(value: unknown): string {
  const json = canonicalJson(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** JSON with object keys sorted, so key order never changes the hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function makeTag(intent: string, payload: unknown): string {
  return `${TAG_PREFIX}:${intent}:${stableHash(payload)}`;
}

export type ParsedTag = { intent: string; hash: string };

export function parseTag(comment: string | undefined | null): ParsedTag | null {
  if (!comment) return null;
  const m = /(?:^|[\s"'])mmagic:([a-z0-9-]+):([0-9a-f]{8})(?:[\s"']|$)/i.exec(comment);
  if (!m) return null;
  return { intent: m[1]!.toLowerCase(), hash: m[2]!.toLowerCase() };
}

export function isManagedBy(comment: string | undefined | null, intent: string): boolean {
  const t = parseTag(comment);
  return !!t && t.intent === intent;
}

/** All tags of one intent already present on the device. */
export function tagsForIntent(comments: Array<string | undefined>, intent: string): string[] {
  const out: string[] = [];
  for (const c of comments) {
    const t = parseTag(c);
    if (t && t.intent === intent) out.push(`${TAG_PREFIX}:${t.intent}:${t.hash}`);
  }
  return out;
}
