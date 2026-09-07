// Pure helpers for Telegram inline approve/reject of service purchases.
//
// Telegram limits callback_data to 64 bytes, so we cannot carry a random
// database-backed token like the bank-receipt flow does. Instead the payload is
// the purchase id plus a truncated HMAC over `${action}:${purchaseId}`, signed
// with the bot credential. Replay is harmless: the decision helpers only claim
// rows that are still `pending`.

export type PurchaseAction = "approve" | "reject";

const PREFIX: Record<PurchaseAction, string> = { approve: "sok", reject: "sno" };
const SIG_LEN = 12;

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hmac(material: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(material),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/** Compact, signed callback payload. Empty string when no credential exists. */
export async function purchaseCallbackData(
  action: PurchaseAction,
  purchaseId: string,
  material: string,
): Promise<string> {
  if (!material) return "";
  const compact = purchaseId.replace(/-/g, "");
  const sig = (await hmac(material, `${action}:${purchaseId}`)).slice(0, SIG_LEN);
  return `${PREFIX[action]}:${compact}:${sig}`;
}

function expand(compact: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(compact)) return null;
  const s = compact.toLowerCase();
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies a callback payload. Returns null for anything unrecognised. */
export async function parsePurchaseCallback(
  data: string,
  material: string,
): Promise<{ action: PurchaseAction; purchaseId: string } | null> {
  if (!material) return null;
  const [prefix, compact, sig] = String(data).split(":");
  const action = (Object.keys(PREFIX) as PurchaseAction[]).find((a) => PREFIX[a] === prefix);
  if (!action || !compact || !sig) return null;
  const purchaseId = expand(compact);
  if (!purchaseId) return null;
  const expected = (await hmac(material, `${action}:${purchaseId}`)).slice(0, SIG_LEN);
  return safeEqual(sig.toLowerCase(), expected) ? { action, purchaseId } : null;
}
