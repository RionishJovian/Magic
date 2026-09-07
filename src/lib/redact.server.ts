/**
 * Central server-side redaction. Everything that reaches an audit row, a log
 * line or an API response goes through here first.
 */

const SECRET_KEY_RE =
  /^(authorization|proxy-authorization|www-authenticate|password|passwd|pass|api_password|old_password|new_password|token|access_token|refresh_token|bearer|secret|api_key|apikey|x-api-key|credential|credentials|cookie|set-cookie|session|private_key|pairing_code|rollback_script)$/i;

export const REDACTED = "[redacted]";

export function redactText(input: string): string {
  if (!input) return input;
  return input
    .replace(
      /\b(Bearer|Basic|Digest)\s+[A-Za-z0-9._~+/=-]+/gi,
      (_m, scheme: string) => `${scheme} ${REDACTED}`,
    )
    .replace(
      /([?&](?:password|passwd|token|secret|api_key|apikey|code)=)[^&\s]+/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /\b(password|passwd|pass|token|secret|api_key|apikey)\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi,
      (_m, key: string) => `${key}=${REDACTED}`,
    )
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, `$1$2:${REDACTED}@`);
}

export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value == null) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_RE.test(key) ? REDACTED : redactDeep(val, depth + 1);
  }
  return out;
}

/** One-line, secret-free error string safe for storage and display. */
export function safeError(err: unknown, max = 300): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return redactText(raw).replace(/\s+/g, " ").trim().slice(0, max);
}
