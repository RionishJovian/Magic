/** Public ingest path. Token is the last path segment (RouterOS fetch-friendly). */
export const SYSLOG_INGEST_PATH = "/api/public/hooks/syslog";

export const SYSLOG_TOKEN_PREFIX = "mmsys_";
export const SYSLOG_MAX_BODY_BYTES = 64 * 1024;
export const SYSLOG_MAX_EVENTS_PER_REQUEST = 200;
export const SYSLOG_MAX_EVENTS_PER_MINUTE = 120;
export const SYSLOG_RETENTION_DAYS = 14;
export const SYSLOG_MAX_TOKENS_PER_OWNER = 20;
export const SYSLOG_MESSAGE_MAX = 4000;

export type SyslogSeverity = "critical" | "warning" | "info";

export type IncomingEvent = {
  message?: string;
  severity?: string;
  program?: string;
  facility?: string;
  source_ip?: string;
  router_id?: string;
  site_id?: string;
};

export type BoundToken = {
  id: string;
  owner_id: string;
  router_id: string | null;
  site_id: string | null;
};

const ALLOWED_SEVERITY = new Set<SyslogSeverity>(["critical", "warning", "info"]);

export function syslogIngestUrl(origin: string, token?: string): string {
  const base = `${origin.replace(/\/+$/, "")}${SYSLOG_INGEST_PATH}`;
  return token ? `${base}/${token}` : base;
}

/** Same 401 body for missing, malformed, and unknown tokens — no oracle. */
export function ingestUnauthorizedBody() {
  return { ok: false as const, error: "unauthorized" };
}

export function ingestFailedBody() {
  return { ok: false as const, error: "ingest failed" };
}

export function extractPresentedToken(
  pathToken: string,
  authorizationHeader: string | null | undefined,
): string {
  const path = String(pathToken || "").trim();
  const header = String(authorizationHeader || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (header && path && header !== path) return "";
  return header || path;
}

export function tokenLooksPlausible(token: string): boolean {
  if (token.length < 16 || token.length > 128) return false;
  return /^[A-Za-z0-9_-]+$/.test(token);
}

export function coerceSeverity(v: unknown): SyslogSeverity {
  const s = String(v ?? "").toLowerCase();
  if (ALLOWED_SEVERITY.has(s as SyslogSeverity)) return s as SyslogSeverity;
  if (["emerg", "emergency", "alert", "crit", "err", "error"].includes(s)) return "critical";
  if (["warn", "warning", "notice"].includes(s)) return "warning";
  return "info";
}

/** Best-effort severity from a RouterOS /log line (time + topics + message). */
export function inferSeverityFromLine(line: string): SyslogSeverity {
  const lower = line.toLowerCase();
  if (/\b(critical|error|err|alert|emerg|emergency)\b/.test(lower)) return "critical";
  if (/\b(warning|warn)\b/.test(lower)) return "warning";
  return "info";
}

export function parseIngestBody(rawText: string, contentType: string): IncomingEvent[] {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const parsed = JSON.parse(rawText) as
        IncomingEvent | IncomingEvent[] | { events?: IncomingEvent[] };
      if (Array.isArray(parsed)) return parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { events?: IncomingEvent[] }).events)
      ) {
        return (parsed as { events: IncomingEvent[] }).events;
      }
      return [parsed as IncomingEvent];
    } catch {
      return [];
    }
  }
  return rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((message) => ({ message, severity: inferSeverityFromLine(message) }));
}

export function stampIngestRows(
  events: IncomingEvent[],
  token: BoundToken,
  clientIp: string | null,
): Array<{
  owner_id: string;
  token_id: string;
  router_id: string | null;
  site_id: string | null;
  source_ip: string | null;
  facility: string | null;
  severity: SyslogSeverity;
  program: string | null;
  message: string;
}> {
  const sliced = events.slice(0, SYSLOG_MAX_EVENTS_PER_REQUEST);
  const rows = [];
  for (const e of sliced) {
    const message = String(e.message ?? "").trim();
    if (!message) continue;
    rows.push({
      owner_id: token.owner_id,
      token_id: token.id,
      // Binding comes from the token, never from the client payload.
      router_id: token.router_id,
      site_id: token.site_id,
      source_ip: clientIp,
      facility: e.facility ? String(e.facility).slice(0, 40) : null,
      severity: e.severity ? coerceSeverity(e.severity) : inferSeverityFromLine(message),
      program: e.program ? String(e.program).slice(0, 60) : null,
      message: message.slice(0, SYSLOG_MESSAGE_MAX),
    });
  }
  return rows;
}

export function wouldExceedMinuteQuota(already: number, incoming: number): boolean {
  return already + incoming > SYSLOG_MAX_EVENTS_PER_MINUTE;
}

/**
 * RouterOS 7 scheduler that POSTs new `/log` lines as text/plain.
 * Native UDP syslog cannot hit this HTTPS webhook — this poller is the supported path.
 */
export function buildSyslogShipperScript(ingestUrl: string): string {
  const url = ingestUrl.replace(/["\\\s]/g, "");
  return `# =====================================================================
# SYSLOG AI — HTTPS shipper (RouterOS 7.1+)
# Outbound HTTPS 443 only. Do not use /system logging action remote (UDP).
# First run remembers the newest log id so history is not dumped.
# =====================================================================

:global mmSyslogUrl "${url}"
:global mmSyslogCursor

/system script remove [find name="mm-syslog-ship"]
/system script add name="mm-syslog-ship" policy=read,write,test,sensitive source={
  :global mmSyslogUrl
  :global mmSyslogCursor
  :if ([:len $mmSyslogUrl] < 20) do={ :return }
  :local ids [/log find]
  :if ([:len $ids] = 0) do={ :return }
  :if ([:typeof $mmSyslogCursor] = "nothing") do={
    :set mmSyslogCursor ($ids->([:len $ids] - 1))
    :return
  }
  :local found 0
  :foreach i in=$ids do={
    :if ($i = $mmSyslogCursor) do={ :set found 1 }
  }
  :if ($found = 0) do={
    :set mmSyslogCursor ($ids->([:len $ids] - 1))
    :return
  }
  :local buf ""
  :local n 0
  :local passing 0
  :foreach i in=$ids do={
    :if ($passing = 1) do={
      :local t [/log get $i time]
      :local topics [/log get $i topics]
      :local msg [/log get $i message]
      :set buf ($buf . $t . " " . $topics . " " . $msg . "\\r\\n")
      :set n ($n + 1)
      :set mmSyslogCursor $i
      :if ($n >= 80) do={
        /tool fetch url=$mmSyslogUrl http-method=post http-header-field="content-type: text/plain" http-data=$buf output=none
        :return
      }
    }
    :if ($i = $mmSyslogCursor) do={ :set passing 1 }
  }
  :if ($n > 0) do={
    /tool fetch url=$mmSyslogUrl http-method=post http-header-field="content-type: text/plain" http-data=$buf output=none
  }
}

/system scheduler remove [find name="mm-syslog-ship"]
/system scheduler add name="mm-syslog-ship" interval=15s on-event="mm-syslog-ship" policy=read,write,test,sensitive comment="MikroTik Magic Syslog AI"
`;
}
