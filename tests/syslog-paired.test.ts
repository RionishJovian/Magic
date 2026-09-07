import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hubHostFromName, isHubMode } from "@/lib/connection-mode";
import {
  coerceRouterOsLogRows,
  dropSeenPairedLogs,
  isHighSignalLog,
  isRoutineApiAccountLog,
  loggingSendsTopicToMemory,
  mapRouterOsLogsToEvents,
  pairedLogDedupeKey,
  pairedLogKind,
  pairedLogKindLabel,
  selectPairedLogRows,
  topicsToString,
} from "@/lib/syslog-paired";

const PAGE = readFileSync("src/routes/_authenticated/app.syslog.tsx", "utf8");
const FNS = readFileSync("src/lib/syslog.functions.ts", "utf8");
const CONN = readFileSync("src/lib/router-conn.server.ts", "utf8");
const PULL = readFileSync("src/lib/syslog-paired.server.ts", "utf8");
const INSERT_SQL = readFileSync(
  "supabase/migrations/20260818210000_syslog_events_tenant_insert.sql",
  "utf8",
);

describe("isHubMode", () => {
  it("treats legacy cloud rows as Magic Hub", () => {
    expect(isHubMode("hub")).toBe(true);
    expect(isHubMode("cloud")).toBe(true);
    expect(isHubMode("direct")).toBe(false);
  });

  it("builds a dial-safe nickname from the router name", () => {
    expect(hubHostFromName("CCR 2004")).toBe("ccr-2004");
    expect(hubHostFromName("  ")).toBe("magic-hub-board");
  });
});

describe("pairedLogKind", () => {
  it("treats Magic Hub WireGuard peers as paired without a syslog token", () => {
    expect(
      pairedLogKind({
        id: "r1",
        connection_mode: "hub",
        cloud_peer_id: "peer-1",
      }),
    ).toBe("hub");
    expect(pairedLogKindLabel("hub")).toBe("Magic Hub");
    expect(
      pairedLogKind({
        id: "r1",
        connection_mode: "cloud",
        cloud_peer_id: "peer-1",
      }),
    ).toBe("hub");
  });

  it("does not treat Cloud Remote hostname+password as a log pairing", () => {
    expect(pairedLogKind({ id: "r1", connection_mode: "direct", cloud_peer_id: null })).toBeNull();
  });
});

describe("mapRouterOsLogsToEvents", () => {
  const binding = {
    owner_id: "owner-1",
    router_id: "router-1",
    site_id: "site-1",
    source_ip: "magic-hub",
  };

  it("maps topics to severity and skips lines already stored", () => {
    const incoming = mapRouterOsLogsToEvents(
      [
        {
          ".id": "*1A",
          time: "aug/18 11:47:22",
          topics: "system,error,critical",
          message: "login failure",
        },
        { ".id": "*1B", time: "aug/18 11:47:23", topics: "system,info", message: "hello" },
      ],
      binding,
    );
    expect(incoming[0]?.severity).toBe("critical");
    expect(incoming[0]?.facility).toBe("hub:*1A");
    const seen = new Set([pairedLogDedupeKey(incoming[0]!.facility, incoming[0]!.message)]);
    expect(dropSeenPairedLogs(incoming, seen)).toHaveLength(1);
  });

  it("keeps critical and warning when the memory log is flooded with info", () => {
    const flood: Array<{ ".id": string; topics: unknown; message: string }> = Array.from(
      { length: 220 },
      (_, i) => ({
        ".id": `*${i}`,
        topics: "dhcp,info",
        message: `lease ${i}`,
      }),
    );
    flood.push({
      ".id": "*crit",
      topics: ["system", "error", "critical"],
      message: "login failure",
    });
    flood.push({ ".id": "*warn", topics: "system,warning", message: "disk 80%" });
    const incoming = mapRouterOsLogsToEvents(flood, binding);
    expect(incoming.some((e) => e.severity === "critical")).toBe(true);
    expect(incoming.some((e) => e.severity === "warning")).toBe(true);
    expect(topicsToString(["system", "warning"])).toBe("system,warning");
    expect(isHighSignalLog({ topics: "system,warning", message: "disk" })).toBe(true);
    expect(selectPairedLogRows(flood).some((r) => r[".id"] === "*crit")).toBe(true);
  });

  it("drops routine Magic Hub API account sessions but retains failed logins", () => {
    const routine = {
      ".id": "*api",
      topics: "system,info,account",
      message: "user admin logged out via api",
    };
    const failed = {
      ".id": "*failed",
      topics: "hotspot,info,debug",
      message: "login failed: RADIUS server is not responding",
    };
    expect(isRoutineApiAccountLog(routine)).toBe(true);
    expect(isHighSignalLog(routine)).toBe(false);
    expect(
      mapRouterOsLogsToEvents([routine, failed], binding).map((row) => row.message),
    ).toHaveLength(1);
    expect(mapRouterOsLogsToEvents([routine, failed], binding)[0]?.message).toContain("RADIUS");
  });

  it("coerces a single REST object and rejects a truncated error payload", () => {
    expect(coerceRouterOsLogRows({ ".id": "*1", topics: ["error"], message: "boom" })).toHaveLength(
      1,
    );
    expect(() => coerceRouterOsLogRows({ error: 400, message: "bad" })).toThrow(/bad/);
  });

  it("treats stock critical→echo as missing from /log", () => {
    expect(loggingSendsTopicToMemory([{ topics: "critical", action: "echo" }], "critical")).toBe(
      false,
    );
    expect(loggingSendsTopicToMemory([{ topics: "critical", action: "memory" }], "critical")).toBe(
      true,
    );
  });
});

describe("Magic Hub feature wiring", () => {
  it("pulls /log over the existing pairing and never dials a hub label", () => {
    expect(FNS).toContain("syncPairedRouterLogs");
    expect(FNS).toContain("pullPairedRouterLogs");
    expect(PULL).toContain("topics=*warning*");
    expect(PULL).toContain("topics=*critical*");
    expect(PULL).toContain("/system/logging");
    expect(PAGE).toContain("syncPairedRouterLogs");
    expect(PAGE).toContain("no ingest token");
    expect(CONN).toContain("isHubMode");
    expect(CONN).toContain("cloudRestBase");
  });

  it("stores paired /log pulls as the tenant owner even when INSERT RLS is missing", () => {
    expect(INSERT_SQL).toContain("tenant insert syslog");
    expect(INSERT_SQL).toMatch(/FOR INSERT TO authenticated/);
    expect(INSERT_SQL).toContain("owner_id = public.effective_owner(auth.uid())");
    expect(FNS).toContain('supabaseAdmin.from("syslog_events").insert(fresh)');
    expect(FNS).toContain("Refusing to store logs for another account.");
    expect(readFileSync(".lovable/sql/syslog-events-tenant-insert.sql", "utf8")).toContain(
      "tenant insert syslog",
    );
  });

  it("toasts and highlights a paired sync store failure instead of burying it in muted status", () => {
    expect(PAGE).toContain("Could not store logs from");
    expect(PAGE).toContain('role="alert"');
    expect(PAGE).toContain("Last Magic Hub pull could not be stored");
    expect(PAGE).not.toMatch(/sync\?\.error \? ` · \$\{sync\.error\}`/);
  });
});
