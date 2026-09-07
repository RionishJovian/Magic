/**
 * Pure safety checks for Owner Apply fix. Rejects destructive / multi-shot
 * scripts before they ever touch a physical RouterBOARD.
 */
const BLOCKED = [
  /\bformat\b/i,
  /\/system\s+reset/i,
  /\/system\s+backup\s+save/i,
  /\/file\s+remove/i,
  /\/user\s+remove/i,
  /password\s*=/i,
  /\/certificate\s+remove/i,
  /\/store\s+remove/i,
  /\/disk\s+format/i,
];

export function sanitizeFixCommand(
  raw: string,
): { ok: true; script: string } | { ok: false; reason: string } {
  const script = raw.trim();
  if (!script) return { ok: false, reason: "Empty fix command." };
  if (script.length > 500) return { ok: false, reason: "Fix command too long (max 500 chars)." };
  if (script.includes("\n") || script.includes("\r")) {
    return { ok: false, reason: "Only a single-line RouterOS command is allowed." };
  }
  // Disallow chained shell-style pipes; allow RouterOS `[find]` brackets.
  if (script.includes("|") || script.includes("&&") || script.includes("`")) {
    return { ok: false, reason: "Command contains disallowed operators." };
  }
  for (const re of BLOCKED) {
    if (re.test(script))
      return { ok: false, reason: "Command blocked as potentially destructive." };
  }
  return { ok: true, script };
}
