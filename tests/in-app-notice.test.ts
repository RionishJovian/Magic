import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  NOTICE_DURATION_MS,
  NOTICE_ICON,
  noticeToneForKind,
  noticeToneForSeverity,
} from "@/lib/notify/tone";

describe("in-app notice tones", () => {
  it("uses red alerts only for critical kinds", () => {
    expect(noticeToneForKind("client_expired")).toBe("critical");
    expect(noticeToneForSeverity("critical")).toBe("critical");
    expect(NOTICE_ICON.critical).toBe("❗️");
  });

  it("uses yellow caution only for attention events", () => {
    expect(noticeToneForKind("service_purchase_review")).toBe("caution");
    expect(noticeToneForKind("service_purchase_rejected")).toBe("caution");
    expect(noticeToneForSeverity("warning")).toBe("caution");
    expect(NOTICE_ICON.caution).toBe("⚠️");
  });

  it("renders ordinary mail in the white mail tone", () => {
    expect(noticeToneForKind("agent_account_created")).toBe("mail");
    expect(noticeToneForKind("service_purchase_approved")).toBe("mail");
    expect(noticeToneForKind("service_purchase_pending")).toBe("mail");
    expect(noticeToneForSeverity("info")).toBe("mail");
    expect(NOTICE_ICON.mail).toBe("✉️");
  });

  it("auto-closes popups after 5 seconds", () => {
    expect(NOTICE_DURATION_MS).toBe(5_000);
  });
});

describe("notification remove wiring", () => {
  it("lets recipients delete read notifications and acknowledged alerts", () => {
    const bell = readFileSync("src/components/NotificationsBell.tsx", "utf8");
    expect(bell).toMatch(/deleteNotification/);
    expect(bell).toMatch(/deleteReadNotifications/);
    expect(bell).toMatch(/Clear read/);
    expect(bell).not.toMatch(/toast\.warning/);

    const incidents = readFileSync("src/routes/_authenticated/app.incidents.tsx", "utf8");
    expect(incidents).toMatch(/dismissIncident/);
    expect(incidents).toMatch(/i\.acknowledged_at/);

    const sql = readFileSync(
      "supabase/migrations/20260818143000_admin_notifications_delete.sql",
      "utf8",
    );
    expect(sql).toMatch(/FOR DELETE/);
  });
});
