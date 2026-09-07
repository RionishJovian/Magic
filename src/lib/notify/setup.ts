// Pure helpers for the Telegram setup panel. Nothing here reads secrets — it
// only decides what is safe to show and where the webhook may point.

export const TELEGRAM_CALLBACK_PATH = "/api/public/hooks/telegram/callback";

/** Owner chat id, masked so a screenshot of the panel leaks nothing useful. */
export function maskChatId(chatId: string): string {
  const s = String(chatId ?? "").trim();
  if (!s) return "";
  const sign = s.startsWith("-") ? "-" : "";
  const digits = s.replace(/^-/, "");
  if (digits.length <= 4) return `${sign}••••`;
  return `${sign}••••${digits.slice(-4)}`;
}

export function callbackUrlFor(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${TELEGRAM_CALLBACK_PATH}`;
}

export interface PublicUrlVerdict {
  ok: boolean;
  reason?: "missing" | "not_https" | "not_public" | "malformed";
  url?: string;
}

const NON_CANONICAL = [/^localhost$/i, /^127\./, /(^|\.)id-preview--/i, /-dev\.lovable\.app$/i];

/**
 * A webhook may only be registered against a canonical, public HTTPS origin.
 * Preview and local hosts are rejected so we never silently point the owner's
 * bot at a build that will disappear.
 */
export function validatePublicBaseUrl(raw: string | undefined | null): PublicUrlVerdict {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, reason: "missing" };
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (NON_CANONICAL.some((re) => re.test(u.hostname))) return { ok: false, reason: "not_public" };
  return { ok: true, url: callbackUrlFor(u.origin) };
}

/** Max test notifications per owner, per window. */
export const TEST_LIMIT = 3;
export const TEST_WINDOW_MS = 60 * 60 * 1000;

export function isTestRateLimited(
  recent: Array<{ created_at: string }>,
  now: number = Date.now(),
): boolean {
  return (
    recent.filter((r) => now - new Date(r.created_at).getTime() < TEST_WINDOW_MS).length >=
    TEST_LIMIT
  );
}

/**
 * Strips anything token-shaped out of a value before it can reach the browser
 * or a log line. Telegram echoes the bot token inside webhook URLs and error
 * strings, so this runs on every response we surface.
 */
export function redactSecrets(value: unknown, secrets: string[] = []): unknown {
  const live = secrets.filter(Boolean);
  const scrub = (s: string) => {
    let out = s;
    for (const secret of live) out = out.split(secret).join("[redacted]");
    return out.replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[redacted]");
  };
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, live));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/token|secret|api_key/i.test(k)) continue;
      out[k] = redactSecrets(v, live);
    }
    return out;
  }
  return value;
}
