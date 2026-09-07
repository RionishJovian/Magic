import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { labelOpsAction } from "@/lib/audit-labels";
import { AUDIT_OPS_DEFAULT_LIMIT, AUDIT_POLL_MS, AUDIT_SAVE_LIMIT } from "@/lib/audit.functions";

describe("audit log workflow", () => {
  const page = readFileSync("src/routes/_authenticated/app.audit.tsx", "utf8");
  const auditFns = readFileSync("src/lib/audit.functions.ts", "utf8");

  it("polls every 15s while the tab is open (not 15 minutes)", () => {
    expect(AUDIT_POLL_MS).toBe(15_000);
    expect(page).toContain("AUDIT_POLL_MS");
    expect(page).toContain("refetchOnWindowFocus: true");
    expect(page).toContain("staleTime: 0");
    expect(page).toContain("refreshAll");
  });

  it("shows operations audit (not only router saves)", () => {
    expect(page).toContain("listRouterOpsAudit");
    expect(page).toContain('tab === "operations"');
    expect(page).toContain("Operations");
  });

  it("loads more than 50 operations rows", () => {
    expect(AUDIT_OPS_DEFAULT_LIMIT).toBe(100);
    expect(auditFns).toContain(".range((data.page - 1) * AUDIT_OPS_DEFAULT_LIMIT");
    expect(auditFns).toContain("data.page * AUDIT_OPS_DEFAULT_LIMIT - 1");
    expect(AUDIT_SAVE_LIMIT).toBe(200);
  });

  it("labels common ops actions in plain language", () => {
    expect(labelOpsAction("connection_check")).toBe("Connection check");
    expect(labelOpsAction("hotspot_setup_result")).toBe("Hotspot setup");
  });
});
