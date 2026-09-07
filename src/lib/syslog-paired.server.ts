import type { RouterConn } from "./mikrotik.server";
import {
  coerceRouterOsLogRows,
  loggingSendsTopicToMemory,
  selectPairedLogRows,
  type RouterOsLogRow,
} from "./syslog-paired";

export const MM_SYSLOG_MEMORY_COMMENT = "mm-syslog-ai";

const PROPLIST = ".id,time,topics,message";

/** Topic filters so error/warning/critical are not drowned by DHCP info. */
export const PAIRED_LOG_HIGH_SIGNAL_PATHS = [
  `/log?.proplist=${PROPLIST}&topics=*critical*`,
  `/log?.proplist=${PROPLIST}&topics=*error*`,
  `/log?.proplist=${PROPLIST}&topics=*warning*`,
  `/log?.proplist=${PROPLIST}&topics=*account*`,
];

export const PAIRED_LOG_DUMP_PATH = `/log?.proplist=${PROPLIST}`;

async function tryLogPath(conn: RouterConn, path: string): Promise<RouterOsLogRow[]> {
  const { routerAPI } = await import("./mikrotik.server");
  try {
    return coerceRouterOsLogRows(await routerAPI.raw(conn, path));
  } catch {
    return [];
  }
}

async function addMemoryTopic(conn: RouterConn, topic: string): Promise<void> {
  const { routerAPI } = await import("./mikrotik.server");
  const body = JSON.stringify({
    topics: topic,
    action: "memory",
    comment: MM_SYSLOG_MEMORY_COMMENT,
  });
  try {
    await routerAPI.raw(conn, "/system/logging", { method: "PUT", body });
  } catch {
    await routerAPI.raw(conn, "/system/logging/add", { method: "POST", body });
  }
}

/** Stock RouterOS sends `critical` to echo, not memory — `/log` never sees it. */
export async function ensureCriticalWarningInMemory(conn: RouterConn): Promise<void> {
  const { routerAPI } = await import("./mikrotik.server");
  try {
    const raw = await routerAPI.raw<unknown>(conn, "/system/logging");
    const rows = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>)
      : raw && typeof raw === "object"
        ? [raw as Record<string, unknown>]
        : [];
    for (const topic of ["critical", "warning", "error"] as const) {
      if (loggingSendsTopicToMemory(rows, topic)) continue;
      try {
        await addMemoryTopic(conn, topic);
      } catch {
        /* REST user may be read-only */
      }
    }
  } catch {
    /* board still online for /log even if logging menu is denied */
  }
}

/** Pull high-signal /log lines over Magic Hub or Local Connector REST. */
export async function pullPairedRouterLogs(conn: RouterConn): Promise<RouterOsLogRow[]> {
  const { routerAPI } = await import("./mikrotik.server");
  await ensureCriticalWarningInMemory(conn);
  const batches = await Promise.all([
    ...PAIRED_LOG_HIGH_SIGNAL_PATHS.map((path) => tryLogPath(conn, path)),
    tryLogPath(conn, PAIRED_LOG_DUMP_PATH),
  ]);
  const merged: RouterOsLogRow[] = [];
  for (const batch of batches) merged.push(...batch);
  if (merged.length) return selectPairedLogRows(merged);

  const raw = await routerAPI.raw<unknown>(conn, "/log");
  return selectPairedLogRows(coerceRouterOsLogRows(raw));
}
