import {
  inferSeverityFromLine,
  SYSLOG_MAX_EVENTS_PER_REQUEST,
  SYSLOG_MESSAGE_MAX,
  type SyslogSeverity,
} from "./syslog-ingest";
import { isHubMode } from "./connection-mode";

export const PAIRED_LOG_FACILITY_PREFIX = "hub:";

export type PairedLogKind = "hub" | "connector";

export type RouterOsLogRow = {
  ".id"?: string;
  time?: string;
  topics?: unknown;
  message?: string;
};

export type PairedLogRouter = {
  id: string;
  connection_mode?: string | null;
  connector_id?: string | null;
  cloud_peer_id?: string | null;
};

export type PairedLogEvent = {
  owner_id: string;
  router_id: string;
  site_id: string | null;
  source_ip: string;
  facility: string;
  severity: SyslogSeverity;
  program: string | null;
  message: string;
};

const SEVERITY_TOPIC = new Set([
  "critical",
  "error",
  "err",
  "emerg",
  "emergency",
  "alert",
  "crit",
  "warning",
  "warn",
  "notice",
  "info",
  "debug",
]);

export function pairedLogKind(row: PairedLogRouter): PairedLogKind | null {
  if (isHubMode(row.connection_mode) && row.cloud_peer_id) return "hub";
  if (row.connector_id) return "connector";
  return null;
}

export function pairedLogKindLabel(kind: PairedLogKind): string {
  return kind === "hub" ? "Magic Hub" : "Local Connector";
}

export function pairedLogFacility(rosId: string): string {
  return `${PAIRED_LOG_FACILITY_PREFIX}${rosId}`.slice(0, 40);
}

export function pairedLogDedupeKey(facility: string, message: string): string {
  return `${facility}|${message}`;
}

export function topicsToString(topics: unknown): string {
  if (Array.isArray(topics)) {
    return topics
      .map((t) => String(t).trim())
      .filter(Boolean)
      .join(",");
  }
  if (topics == null) return "";
  return String(topics).trim();
}

export function programFromTopics(topics: string): string | null {
  const parts = topics
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const prog = parts.find((p) => !SEVERITY_TOPIC.has(p.toLowerCase()));
  const picked = prog ?? parts[0];
  return picked ? picked.slice(0, 60) : null;
}

export function coerceRouterOsLogRows(raw: unknown): RouterOsLogRow[] {
  if (raw == null || raw === "") return [];
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return [];
    try {
      return coerceRouterOsLogRows(JSON.parse(text) as unknown);
    } catch {
      throw new Error(
        "RouterOS /log did not return a list. The hub response was truncated or not JSON.",
      );
    }
  }
  if (Array.isArray(raw)) {
    return raw.filter((row) => row && typeof row === "object") as RouterOsLogRow[];
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (o.error != null && o[".id"] == null && o.topics == null) {
      throw new Error(String(o.message ?? o.error));
    }
    for (const key of ["ret", "data", "logs", "rows"] as const) {
      if (Array.isArray(o[key])) return coerceRouterOsLogRows(o[key]);
    }
    if (o[".id"] != null || o.message != null || o.topics != null) return [o as RouterOsLogRow];
  }
  return [];
}

export function isHighSignalLog(row: RouterOsLogRow): boolean {
  if (isRoutineApiAccountLog(row)) return false;
  const topics = topicsToString(row.topics);
  const text = String(row.message ?? "");
  const sev = inferSeverityFromLine(topics || text);
  if (sev !== "info") return true;
  return /\b(account|auth|login|firewall|critical|error|warning|link)\b/i.test(`${topics} ${text}`);
}

/**
 * Magic Hub opens RouterOS REST/API sessions while polling. Their successful
 * account login/logout notices are noisy operational telemetry, not Syslog AI
 * incidents. Keep failed auth and every warning/error untouched.
 */
export function isRoutineApiAccountLog(row: RouterOsLogRow): boolean {
  const topics = topicsToString(row.topics).toLowerCase();
  const message = String(row.message ?? "")
    .trim()
    .toLowerCase();
  return (
    topics.includes("system") &&
    topics.includes("account") &&
    topics.includes("info") &&
    /\buser\s+.+\s+logged\s+(?:in|out)\s+via\s+api\b/.test(message)
  );
}

export function selectPairedLogRows(
  logs: RouterOsLogRow[],
  limit = SYSLOG_MAX_EVENTS_PER_REQUEST,
): RouterOsLogRow[] {
  const cap = Math.min(Math.max(limit, 1), SYSLOG_MAX_EVENTS_PER_REQUEST);
  const seen = new Set<string>();
  const unique: RouterOsLogRow[] = [];
  for (const row of logs) {
    const id = String(row[".id"] ?? "").trim() || `msg:${String(row.message ?? "")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(row);
  }
  const high: RouterOsLogRow[] = [];
  const rest: RouterOsLogRow[] = [];
  for (const row of unique) {
    if (isHighSignalLog(row)) high.push(row);
    else rest.push(row);
  }
  const picked = [...high.slice(-cap)];
  if (picked.length < cap) picked.push(...rest.slice(-(cap - picked.length)));
  const order = new Map(unique.map((row, i) => [row, i]));
  return picked.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function loggingSendsTopicToMemory(
  rows: Array<Record<string, unknown>>,
  topic: string,
): boolean {
  const needle = topic.toLowerCase();
  return rows.some((row) => {
    if (String(row.disabled ?? "") === "true") return false;
    if (String(row.action ?? "").toLowerCase() !== "memory") return false;
    const topics = topicsToString(row.topics).toLowerCase();
    return topics.split(/[,\s]+/).includes(needle);
  });
}

export function mapRouterOsLogsToEvents(
  logs: RouterOsLogRow[],
  binding: { owner_id: string; router_id: string; site_id: string | null; source_ip: string },
  limit = SYSLOG_MAX_EVENTS_PER_REQUEST,
): PairedLogEvent[] {
  const selected = selectPairedLogRows(logs, limit).filter((row) => !isRoutineApiAccountLog(row));
  const rows: PairedLogEvent[] = [];
  for (const row of selected) {
    const text = String(row.message ?? "").trim();
    if (!text) continue;
    const topics = topicsToString(row.topics);
    const time = String(row.time ?? "").trim();
    const line = [time, topics, text].filter(Boolean).join(" ");
    const rosId = String(row[".id"] ?? "").trim() || "unknown";
    rows.push({
      owner_id: binding.owner_id,
      router_id: binding.router_id,
      site_id: binding.site_id,
      source_ip: binding.source_ip,
      facility: pairedLogFacility(rosId),
      severity: topics ? inferSeverityFromLine(topics) : inferSeverityFromLine(line),
      program: topics ? programFromTopics(topics) : null,
      message: line.slice(0, SYSLOG_MESSAGE_MAX),
    });
  }
  return rows;
}

export function dropSeenPairedLogs(
  incoming: PairedLogEvent[],
  seenKeys: Iterable<string>,
): PairedLogEvent[] {
  const seen = new Set(seenKeys);
  const out: PairedLogEvent[] = [];
  for (const row of incoming) {
    const key = pairedLogDedupeKey(row.facility, row.message);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
