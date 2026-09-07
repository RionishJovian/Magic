import { toErrorMessage } from "../error-message";

/** Operator-facing copy for voucher plan push failures (not Hotspot Wi‑Fi apply). */
export function formatVoucherPlanPushError(err: unknown): string {
  const raw = toErrorMessage(err, "Could not save this profile on the router.");
  return raw
    .replace(
      /Magical fallback may retry via CLI — open the apply trace for details\.?/gi,
      "Confirm Routers → Test is green, then retry Add to router.",
    )
    .replace(
      /Magical fallback may retry via CLI — open Routers → Hotspot Wi‑Fi and confirm pool, profile, and server are set up\.?/gi,
      "Confirm Routers → Test is green, then retry Add to router. If it persists, open WinBox → IP → Hotspot → User profiles.",
    )
    .replace(
      /Retry after Hotspot Wi‑Fi is applied on Routers, or update RouterOS 7\.1\+\./gi,
      "Confirm Routers → Test is green, then retry Add to router.",
    )
    .replace(
      /open the apply trace for details\.?/gi,
      "Confirm Routers → Test is green, then retry Add to router.",
    );
}
