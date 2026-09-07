// Server-only Telegram adapter. Secrets are read inside the functions, never
// at module scope, and never leave the server.
//
// Two transports are supported, in this order:
//  1. the Lovable Telegram connector (gateway) — no raw bot token stored here,
//  2. a raw TELEGRAM_BOT_TOKEN, kept for projects configured before the
//     connector existed.

import { reviewSummaryLines, nullNotifier, type Notifier, type ReviewNotification } from "./types";

const API = "https://api.telegram.org";
const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

function env() {
  return {
    token: process.env["TELEGRAM_BOT_TOKEN"] ?? "",
    chatId: process.env["TELEGRAM_OWNER_CHAT_ID"] ?? "",
    connectionKey: process.env["TELEGRAM_API_KEY"] ?? "",
    lovableKey: process.env["LOVABLE_API_KEY"] ?? "",
  };
}

/** True when a bot transport (connector gateway or raw token) is available. */
function transportReady(e = env()): boolean {
  return Boolean(e.token || (e.connectionKey && e.lovableKey));
}

export function telegramConfigured(): boolean {
  const e = env();
  return transportReady(e) && Boolean(e.chatId);
}

export function ownerChatId(): string {
  return env().chatId;
}

/**
 * Webhook shared secret, derived from whichever bot credential this project
 * uses so nothing extra has to be stored.
 */
export async function telegramWebhookSecret(): Promise<string> {
  const e = env();
  const material = e.token || e.connectionKey;
  if (!material) return "";
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`telegram-webhook:${material}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function request(
  method: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; result?: unknown; description?: string }> {
  const e = env();
  if (!transportReady(e)) return { ok: false, status: 0, description: "not_configured" };

  const url = e.token ? `${API}/bot${e.token}/${method}` : `${GATEWAY}/${method}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (!e.token) {
    headers["Authorization"] = `Bearer ${e.lovableKey}`;
    headers["X-Connection-Api-Key"] = e.connectionKey;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: unknown;
      description?: string;
      error?: string;
    } | null;
    const ok = res.ok && payload?.ok !== false;
    if (!ok) console.error(`Telegram ${method} failed [${res.status}]`);
    return {
      ok,
      status: res.status,
      result: payload?.result,
      description: payload?.description ?? payload?.error ?? undefined,
    };
  } catch (e2) {
    console.error(`Telegram ${method} error: ${e2 instanceof Error ? e2.message : "unknown"}`);
    return { ok: false, status: 0, description: "network_error" };
  }
}

async function call(method: string, body: unknown): Promise<boolean> {
  return (await request(method, body)).ok;
}

/** Credential material used to sign inline purchase actions. */
export function purchaseSigningMaterial(): string {
  const e = env();
  return e.token || e.connectionKey || "";
}

/** Multipart upload (photo or document). Best effort; never throws. */
async function upload(
  method: string,
  fields: Record<string, string>,
  file: { field: string; bytes: Uint8Array; filename: string; mime: string },
): Promise<boolean> {
  const e = env();
  if (!transportReady(e)) return false;
  const url = e.token ? `${API}/bot${e.token}/${method}` : `${GATEWAY}/${method}`;
  const headers: Record<string, string> = {};
  if (!e.token) {
    headers["Authorization"] = `Bearer ${e.lovableKey}`;
    headers["X-Connection-Api-Key"] = e.connectionKey;
  }
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(
    file.field,
    new Blob([new Uint8Array(file.bytes)], { type: file.mime }),
    file.filename,
  );
  try {
    const res = await fetch(url, { method: "POST", headers, body: form });
    const payload = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    const ok = res.ok && payload?.ok !== false;
    if (!ok) console.error(`Telegram ${method} failed [${res.status}]`);
    return ok;
  } catch (err) {
    console.error(`Telegram ${method} error: ${err instanceof Error ? err.message : "unknown"}`);
    return false;
  }
}

export interface PurchaseReviewMessage {
  purchaseId: string;
  caption: string;
  approveData: string;
  rejectData: string;
  receipt?: { bytes: Uint8Array; filename: string; mime: string } | null;
}

/**
 * Owner alert for a Tier Pass purchase: the payment slip itself plus inline
 * Approve / Reject buttons. Falls back to a plain message when there is no
 * usable attachment or the upload fails.
 */
export async function sendPurchaseReview(msg: PurchaseReviewMessage): Promise<boolean> {
  const { chatId } = env();
  if (!chatId || !transportReady()) return false;
  const reply_markup = {
    inline_keyboard: [
      [
        { text: "Approve", callback_data: msg.approveData },
        { text: "Reject", callback_data: msg.rejectData },
      ],
    ],
  };

  if (msg.receipt) {
    const isImage = msg.receipt.mime.startsWith("image/") && !msg.receipt.mime.includes("heic");
    const sent = await upload(
      isImage ? "sendPhoto" : "sendDocument",
      { chat_id: chatId, caption: msg.caption, reply_markup: JSON.stringify(reply_markup) },
      {
        field: isImage ? "photo" : "document",
        bytes: msg.receipt.bytes,
        filename: msg.receipt.filename,
        mime: msg.receipt.mime,
      },
    );
    if (sent) return true;
  }

  return call("sendMessage", {
    chat_id: chatId,
    text: msg.caption,
    disable_web_page_preview: true,
    reply_markup,
  });
}

/** Bot identity — only the username is ever surfaced to the browser. */
export async function getBotIdentity(): Promise<{ ok: boolean; username: string | null }> {
  const r = await request("getMe", {});
  const username = (r.result as { username?: string } | undefined)?.username ?? null;
  return { ok: r.ok, username: r.ok ? username : null };
}

export interface WebhookInfoSafe {
  ok: boolean;
  registered: boolean;
  /** Registered callback URL with any token-shaped substring removed. */
  url: string | null;
  pending_update_count: number | null;
  last_error_message: string | null;
  last_error_date: string | null;
  has_custom_certificate: boolean;
}

export async function getWebhookInfoSafe(): Promise<WebhookInfoSafe> {
  const { redactSecrets } = await import("./setup");
  const r = await request("getWebhookInfo", {});
  const info = (r.result ?? {}) as Record<string, unknown>;
  const e = env();
  const secrets = [e.token, e.connectionKey, e.lovableKey, await telegramWebhookSecret()].filter(
    Boolean,
  );
  const safe = redactSecrets(
    {
      url: info["url"] ?? null,
      pending_update_count: info["pending_update_count"] ?? null,
      last_error_message: info["last_error_message"] ?? null,
      has_custom_certificate: Boolean(info["has_custom_certificate"]),
    },
    secrets,
  ) as Record<string, unknown>;
  return {
    ok: r.ok,
    registered: Boolean(safe["url"]),
    url: (safe["url"] as string) || null,
    pending_update_count:
      typeof safe["pending_update_count"] === "number" ? safe["pending_update_count"] : null,
    last_error_message: (safe["last_error_message"] as string) || null,
    last_error_date: info["last_error_date"]
      ? new Date(Number(info["last_error_date"]) * 1000).toISOString()
      : null,
    has_custom_certificate: Boolean(safe["has_custom_certificate"]),
  };
}

/**
 * Registers the callback URL with the derived secret header token. Neither the
 * bot token nor the derived secret is returned to the caller.
 */
export async function registerWebhook(
  callbackUrl: string,
): Promise<{ ok: boolean; error: string | null }> {
  const secret = await telegramWebhookSecret();
  if (!secret) return { ok: false, error: "not_configured" };
  const { redactSecrets } = await import("./setup");
  const r = await request("setWebhook", {
    url: callbackUrl,
    secret_token: secret,
    allowed_updates: ["callback_query"],
    drop_pending_updates: true,
  });
  return {
    ok: r.ok,
    error: r.ok
      ? null
      : (redactSecrets(
          r.description ?? "unknown_error",
          [env().token, env().connectionKey, env().lovableKey, secret].filter(Boolean),
        ) as string),
  };
}

/** Generic test message. Never carries receipt, guest or bank information. */
export async function sendTestMessage(): Promise<boolean> {
  const { chatId } = env();
  if (!chatId) return false;
  return call("sendMessage", {
    chat_id: chatId,
    text: "MikroTik Magic test notification — Telegram approvals are wired up correctly. No customer or payment details are included in this message.",
    disable_web_page_preview: true,
  });
}

export function telegramNotifier(): Notifier {
  if (!telegramConfigured()) return nullNotifier;
  return {
    id: "telegram",
    configured: true,
    async notifyReceipt(n: ReviewNotification) {
      return call("sendMessage", {
        chat_id: env().chatId,
        text: reviewSummaryLines(n).join("\n"),
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Approve", callback_data: `ok:${n.approveToken}` },
              { text: "Reject", callback_data: `no:${n.rejectToken}` },
            ],
            [{ text: "Open review page", url: n.reviewUrl }],
          ],
        },
      });
    },
  };
}

export async function answerCallback(callbackId: string, text: string): Promise<void> {
  await call("answerCallbackQuery", { callback_query_id: callbackId, text, show_alert: false });
}

export async function sendOwnerMessage(text: string): Promise<void> {
  const { chatId } = env();
  if (!chatId) return;
  await call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}
