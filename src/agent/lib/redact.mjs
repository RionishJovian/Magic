/**
 * Central redaction used by the connector agent and its CLI.
 *
 * Nothing that reaches a log line, an audit record or the cloud may contain
 * credentials. Everything funnels through `redact()` / `redactText()`.
 */

const SECRET_KEY_RE =
  /^(authorization|proxy-authorization|www-authenticate|password|passwd|pass|api_password|old_password|new_password|token|access_token|refresh_token|bearer|secret|api_key|apikey|x-api-key|credential|credentials|cookie|set-cookie|session|private_key|pairing_code)$/i;

export const REDACTED = "[redacted]";

/** Mask secrets that appear inside a free-form string. */
export function redactText(input) {
  if (typeof input !== "string" || input.length === 0) return input;
  return input
    .replace(
      /\b(Bearer|Basic|Digest)\s+[A-Za-z0-9._~+/=-]+/gi,
      (_m, scheme) => `${scheme} ${REDACTED}`,
    )
    .replace(
      /([?&](?:password|passwd|token|secret|api_key|apikey|code)=)[^&\s]+/gi,
      `$1${REDACTED}`,
    )
    .replace(
      /\b(password|passwd|pass|token|secret|api_key|apikey)\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi,
      (_m, key) => `${key}=${REDACTED}`,
    )
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, `$1$2:${REDACTED}@`);
}

/** Deep-redact an object/array before logging or shipping it. */
export function redact(value, depth = 0) {
  if (depth > 6) return REDACTED;
  if (value == null) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SECRET_KEY_RE.test(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
}

/** Safe one-line error message for heartbeats and audit rows. */
export function safeError(err, max = 300) {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  return redactText(raw).replace(/\s+/g, " ").trim().slice(0, max);
}
