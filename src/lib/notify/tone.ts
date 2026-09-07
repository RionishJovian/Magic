export const NOTICE_DURATION_MS = 5_000;

export type NoticeTone = "critical" | "caution" | "mail";

const CRITICAL_KINDS = new Set(["client_expired"]);
const CAUTION_KINDS = new Set([
  "service_purchase_review",
  "service_purchase_rejected",
  "service_purchase_refunded",
]);

/** Map a stored admin-notification kind onto the three in-app popup tones. */
export function noticeToneForKind(kind: string): NoticeTone {
  if (CRITICAL_KINDS.has(kind)) return "critical";
  if (CAUTION_KINDS.has(kind)) return "caution";
  return "mail";
}

export function noticeToneForSeverity(severity: string | null | undefined): NoticeTone {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "caution";
  return "mail";
}

export const NOTICE_ICON: Record<NoticeTone, string> = {
  critical: "❗️",
  caution: "⚠️",
  mail: "✉️",
};
