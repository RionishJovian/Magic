/**
 * Turn thrown/serialized server errors into toast-safe, operator-friendly copy.
 *
 * Product rule: never show raw HTTP/RouterOS/Hub digit codes or HTML/JSON dumps
 * to Clients. Always lead with the cause, then how to fix.
 */

export type UserFacingError = {
  /** Short cause (toast title / primary line). */
  cause: string;
  /** How to fix (toast description / second sentence). */
  fix?: string;
};

/** Extract a raw string from Error / PostgREST / Zod / nested shapes. */
export function extractErrorText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") {
    const t = err.trim();
    return t && t !== "[object Object]" && t !== "{}" ? t : "";
  }
  if (err instanceof Error) {
    const t = err.message?.trim();
    if (t && t !== "[object Object]" && t !== "{}") return t;
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string") {
      const t = o.message.trim();
      if (t && t !== "[object Object]" && t !== "{}") return t;
    }
    if (typeof o.error === "string" && o.error.trim() && o.error.trim() !== "[object Object]") {
      return o.error.trim();
    }
    if (typeof o.details === "string" && o.details.trim()) return o.details.trim();
    if (Array.isArray(o.issues) && o.issues.length > 0) {
      const first = o.issues[0];
      if (
        first &&
        typeof first === "object" &&
        typeof (first as { message?: unknown }).message === "string"
      ) {
        return (first as { message: string }).message;
      }
    }
    if (o.cause != null) {
      const nested = extractErrorText(o.cause);
      if (nested) return nested;
    }
  }
  try {
    const json = JSON.stringify(err);
    if (
      json &&
      json !== "{}" &&
      json !== '{"message":{}}' &&
      json !== "null" &&
      !json.includes("[object Object]")
    )
      return json;
  } catch {
    /* ignore */
  }
  return "";
}

function joinCauseFix(cause: string, fix?: string): string {
  const c = cause.trim();
  const f = fix?.trim();
  if (!c) return f ?? "";
  if (!f) return c;
  if (c.endsWith(".") || c.endsWith("!") || c.endsWith("?")) return `${c} ${f}`;
  return `${c}. ${f}`;
}

function stripHtmlNoise(text: string): string {
  return text
    .replace(/<!doctype[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRouterOsDetail(body: string): string {
  const cleaned = stripHtmlNoise(body);
  try {
    const j = JSON.parse(cleaned) as { detail?: string; message?: string };
    const detail = (j.detail || j.message || "").trim();
    if (detail) return detail;
  } catch {
    /* not JSON */
  }
  return cleaned.slice(0, 160);
}

/**
 * Map a raw RouterOS / Hub / DB failure string into cause + fix.
 * Safe to call repeatedly (already-human messages pass through).
 */
export function explainError(raw: string): UserFacingError {
  const text = raw.trim();
  if (!text || text === "[object Object]") {
    return {
      cause: "Something went wrong",
      fix: "Retry once. If it keeps failing, open Routers and run Test, or contact the app owner.",
    };
  }

  // Cloudflare origin DNS (already friendly in mikrotik.server — keep as-is).
  if (/Cannot resolve router hostname/i.test(text) && /DDNS|CGNAT|Magic Hub/i.test(text)) {
    return { cause: text };
  }

  // Device quota (also covered by friendlyDeviceError).
  if (/DEVICE_QUOTA_EXCEEDED/i.test(text)) {
    return {
      cause: "Device limit reached",
      fix: "Ask the app owner to approve another device slot.",
    };
  }
  if (/PLUS_TIER_PASS_RETIRED/i.test(text)) {
    return { cause: "This retired service is no longer available." };
  }

  // Account / auth (already English — lightly polish if coded).
  if (/Your account is not activated/i.test(text) || /read-only access until/i.test(text)) {
    return { cause: text };
  }
  if (/^Unauthorized:/i.test(text)) {
    return {
      cause: "Session expired or not signed in",
      fix: "Sign out and sign back in, then retry.",
    };
  }

  // Postgres / PostgREST
  if (/duplicate key|unique constraint/i.test(text)) {
    return {
      cause: "That name is already in use",
      fix: "Pick a different name, or edit the existing item instead of creating a new one.",
    };
  }
  if (/row-level security|permission denied for|violates row-level security/i.test(text)) {
    return {
      cause: "You do not have permission for this action",
      fix: "Sign out and sign back in. If it still fails, ask the app owner to check your role.",
    };
  }
  if (/column .+ does not exist|relation .+ does not exist/i.test(text)) {
    return {
      cause: "This feature needs a database update on the cloud project",
      fix: "Ask the app owner to apply the pending Lovable Cloud SQL migrations and republish.",
    };
  }

  // Hub HMAC / ops (long but actionable — keep body, shorten title-ish leading).
  if (/VPS_ROUTER_HMAC|HMAC|hub secret/i.test(text) && /unauthorized|401|403/i.test(text)) {
    return {
      cause: "Magic Hub rejected the app’s signing key",
      fix: "App owner: paste matching VPS_ROUTER_* secrets in Lovable Project → Secrets, republish, then try Connect via Hub again.",
    };
  }

  // Hub returned N: …
  {
    const hub = text.match(/^Hub returned (\d{3}):\s*(.*)$/is);
    if (hub) {
      const status = Number(hub[1]);
      const body = hub[2]?.trim() ?? "";
      if (status === 401 || status === 403 || /unauthorized/i.test(body)) {
        return {
          cause: "Magic Hub rejected the app’s credentials",
          fix: "App owner: check VPS_ROUTER_* secrets match the hub, republish, then retry Connect via Hub.",
        };
      }
      if (status === 404 || /nginx|not found/i.test(body)) {
        return {
          cause: "Magic Hub endpoint was not found",
          fix: "App owner: check hub routing and VPS_ROUTER_BASE_URL, then republish. Operators: re-open Show paste window after secrets are fixed.",
        };
      }
      if (status >= 500 || /bad gateway|timeout/i.test(body)) {
        return {
          cause: "Magic Hub is not answering",
          fix: "App owner: check the VPS service and TLS certificate. Retry Connect via Hub in a few minutes.",
        };
      }
      return {
        cause: "Magic Hub could not complete this request",
        fix: "Retry once. If it keeps failing, ask the app owner to check the hub service and secrets.",
      };
    }
  }

  // DNS-over-HTTPS status digit
  {
    const dns = text.match(/DNS lookup failed for (.+?) \(status (\d+)\)\.?(.*)$/i);
    if (dns) {
      const host = dns[1];
      const code = Number(dns[2]);
      const rest = (dns[3] ?? "").trim();
      if (code === 3) {
        return {
          cause: `Hostname “${host}” does not resolve yet`,
          fix:
            rest ||
            "Wait for Cloud DDNS to update, or copy the exact dns-name from /ip cloud print on the router.",
        };
      }
      return {
        cause: `Could not look up hostname “${host}”`,
        fix:
          rest || "Confirm the name has no typo, then retry. Cloud DDNS may still be initializing.",
      };
    }
  }

  // AI gateway
  {
    const ai = text.match(/^AI gateway (\d{3}):\s*(.*)$/is);
    if (ai) {
      const status = Number(ai[1]);
      if (status === 429) {
        return {
          cause: "AI quota is temporarily exhausted",
          fix: "Wait a few minutes and try again, or ask the app owner about LOVABLE_API_KEY limits.",
        };
      }
      if (status === 402) {
        return {
          cause: "AI credits are exhausted",
          fix: "Ask the app owner to top up the Lovable AI plan.",
        };
      }
      return {
        cause: "AI assistant is unavailable right now",
        fix: "Retry later. If it keeps failing, the app owner should check LOVABLE_API_KEY.",
      };
    }
  }

  // Bare HTTP N — (Terminal and similar)
  {
    const http = text.match(/^HTTP (\d{3})\s*[—\-–:]?\s*(.*)$/i);
    if (http) {
      const status = Number(http[1]);
      const rest = (http[2] ?? "").trim();
      const restUseful = rest && !/^check path and credentials\.?$/i.test(rest) ? rest : "";
      if (status === 401 || status === 403) {
        return {
          cause: "Router rejected the username or password",
          fix: restUseful || "Open Routers → Edit and confirm WinBox credentials, then Test again.",
        };
      }
      if (status === 404) {
        return {
          cause: "Router path not found",
          fix: restUseful || "Confirm RouterOS 7.1+ with REST enabled, and the path is correct.",
        };
      }
      return {
        cause: "Could not reach the router",
        fix: restUseful || "Confirm the board is online and credentials are correct, then retry.",
      };
    }
  }

  // RouterOS API N: body  (legacy + any remaining wrappers)
  {
    const ros = text.match(/RouterOS API (\d{3}):\s*([\s\S]*)/i);
    if (ros) {
      const status = Number(ros[1]);
      const body = ros[2] ?? "";
      const detail = parseRouterOsDetail(body);
      const explained = explainRouterOsHttp(status, body, detail);
      // Preserve useful wrapper prefixes like "Wi‑Fi SSID failed (rest): …"
      const prefix = text.slice(0, text.search(/RouterOS API \d{3}:/i)).trim();
      if (prefix) {
        return {
          cause: prefix.replace(/[:\-–—]\s*$/, ""),
          fix: joinCauseFix(explained.cause, explained.fix),
        };
      }
      return explained;
    }
  }

  // Nginx / HTML error pages without RouterOS API prefix
  if (/nginx/i.test(text) || /<!doctype html|<html[\s>]/i.test(text) || /<h1>\s*404/i.test(text)) {
    return {
      cause: "Magic Hub could not reach the router’s REST API",
      fix: "Confirm WireGuard last-handshake is fresh, password matches WinBox, user has rest-api, then re-paste Connect from Show paste window and Test again.",
    };
  }

  // no such command (sometimes without status wrapper)
  if (/no such command/i.test(text)) {
    return {
      cause: "This router rejected a command (menu missing or RouterOS too old)",
      fix: "Update to RouterOS 7.1+ with wifiwave2/REST as needed, then retry. If only one feature fails, skip it and continue.",
    };
  }

  // Strip accidental HTML/JSON dumps that slipped through
  if (/<!doctype html|<html[\s>]/i.test(text) || /^\s*\{[\s\S]*"error"\s*:/i.test(text)) {
    const detail = parseRouterOsDetail(text);
    return {
      cause: "The router returned an unexpected error",
      fix: detail
        ? `Detail: ${detail}. Open Routers → Test for a fix checklist.`
        : "Open Routers → Test for a fix checklist, then retry.",
    };
  }

  // Collapse pure status-code titles like "404" / "502 Bad Gateway"
  if (/^\d{3}(\s+.+)?$/.test(text)) {
    return {
      cause: "Could not complete this request",
      fix: "Retry once. Open Routers → Test if the board is involved, or ask the app owner if it keeps failing.",
    };
  }

  // Already human — pass through (cap length so JSON never floods the toast)
  if (text.length > 420) {
    return { cause: `${text.slice(0, 400).trim()}…` };
  }
  return { cause: text };
}

function explainRouterOsHttp(status: number, body: string, detail: string): UserFacingError {
  const htmlOrNginx = /nginx/i.test(body) || /<!doctype html|<html[\s>]/i.test(body);
  const noSuch = /no such command/i.test(body) || /no such command/i.test(detail);

  if (status === 401) {
    return {
      cause: "Router rejected the username or password",
      fix: "Open Routers → Edit and match WinBox login. User group needs api, rest-api, read, write.",
    };
  }
  if (status === 403) {
    return {
      cause: "Logged in but not allowed to use REST",
      fix: "In WinBox, add rest-api to this API user’s group, then Test again.",
    };
  }
  if (status === 404 && htmlOrNginx) {
    return {
      cause: "Magic Hub could not reach the router’s REST API",
      fix: "Confirm last-handshake is fresh, password matches WinBox, user has rest-api, re-paste Connect from Show paste window, then Check now → Test.",
    };
  }
  if (status === 404) {
    return {
      cause: "Router REST path not found",
      fix: "RouterOS 7.1+ with /rest (www-ssl) is required. Re-paste the latest Magic Hub Connect script if you use Hub.",
    };
  }
  if (status === 502 || status === 503 || status === 504) {
    return {
      cause: "Could not reach the router through Magic Hub",
      fix: "Confirm WAN internet and a fresh WireGuard last-handshake, then Check now → Test. Ignore ping timeouts to the hub IP.",
    };
  }
  if (status === 400 && noSuch) {
    return {
      cause: "This router rejected a command (unsupported menu or RouterOS too old)",
      fix: "Update RouterOS 7.1+ if possible. Magical fallback may retry via CLI — open the apply trace for details.",
    };
  }
  if (status === 400) {
    return {
      cause: "RouterOS rejected this change",
      fix: detail
        ? `Router said: ${detail}. Check the same setting in WinBox, then retry.`
        : "Check the same setting in WinBox, confirm the bridge/IP exists, then retry.",
    };
  }
  if (status === 530 || /\berror code:\s*1016\b/i.test(body)) {
    return {
      cause: "Cannot resolve the router hostname",
      fix: "Copy the exact dns-name from /ip cloud print (status=updated). For CGNAT, use Magic Hub or Local Connector instead of public DDNS.",
    };
  }
  if (
    /no trusted ca|unable to get issuer|self[- ]signed certificate|certificate verify|unknown ca/i.test(
      `${body} ${detail}`,
    )
  ) {
    return {
      cause: "RouterOS could not verify the download certificate",
      fix: "Update RouterOS and its trusted CA store, or import the required public CA for the fetch trust store. MikroTik Magic will never silently bypass certificate checks for binary portal assets.",
    };
  }
  if (status >= 500) {
    return {
      cause: "The router or Magic Hub returned a server error",
      fix: detail
        ? `Detail: ${detail}. Run Routers → Check now → Test, then retry.`
        : "Run Routers → Check now → Test, then retry.",
    };
  }
  return {
    cause: "RouterOS rejected this request",
    fix: detail
      ? `Router said: ${detail}. Run Routers → Test, then retry the same action.`
      : "Run Routers → Test, confirm the API user can use REST, then retry the same action.",
  };
}

/** Build a user-facing RouterOS HTTP failure (cause + fix, no raw status digits). */
export function explainRouterOsStatus(
  status: number,
  body: string,
  opts?: { host?: string },
): string {
  if ((status === 530 || /\berror code:\s*1016\b/i.test(body)) && opts?.host) {
    return joinCauseFix(
      `Cannot resolve router hostname “${opts.host}”`,
      "Check that /ip cloud print shows status=updated and copy the exact dns-name (no https://, no port). If CGNAT, use Magic Hub or Local Connector instead of public DDNS.",
    );
  }
  const detail = parseRouterOsDetail(body);
  const { cause, fix } = explainRouterOsHttp(status, body, detail);
  return joinCauseFix(cause, fix);
}

/** Hub probe / provision failures without “Hub returned 502”. */
export function explainHubStatus(status: number, body: string): string {
  if (status === 0) {
    return toErrorMessage(body || "Magic Hub is unreachable");
  }
  return toErrorMessage(`Hub returned ${status}: ${body}`);
}

/**
 * Toast-safe string: cause + how to fix. Never returns "[object Object]".
 */
export function toErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  const raw = extractErrorText(err);
  if (!raw) return fallback;
  const { cause, fix } = explainError(raw);
  const out = joinCauseFix(cause, fix);
  return out || fallback;
}
