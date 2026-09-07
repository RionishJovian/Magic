import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TICKET_ACTIVATED_KIND,
  ticketActivationNotice,
  voucherHasBeenUsed,
} from "@/lib/voucher-activation";
import { noticeToneForKind } from "@/lib/notify/tone";

describe("voucher first-use detection", () => {
  it("treats a live hotspot session as used", () => {
    expect(voucherHasBeenUsed({ active: { user: "ABC", "mac-address": "AA:BB" } })).toBe(true);
  });

  it("treats traffic or non-zero uptime as used", () => {
    expect(voucherHasBeenUsed({ user: { "bytes-in": "12", "bytes-out": "0" } })).toBe(true);
    expect(voucherHasBeenUsed({ user: { uptime: "00:01:02" } })).toBe(true);
  });

  it("leaves unused codes alone", () => {
    expect(
      voucherHasBeenUsed({ user: { "bytes-in": "0", "bytes-out": "0", uptime: "00:00:00" } }),
    ).toBe(false);
    expect(voucherHasBeenUsed({})).toBe(false);
  });
});

describe("ticket activation notice", () => {
  it("uses a mail-tone kind and names the plan", () => {
    const n = ticketActivationNotice({ code: "VIP-1", planLabel: "1 hour", mac: "AA:BB:CC" });
    expect(n.kind).toBe(TICKET_ACTIVATED_KIND);
    expect(n.title).toContain("1 hour");
    expect(n.body).toContain("VIP-1");
    expect(n.body).toContain("AA:BB:CC");
    expect(noticeToneForKind(n.kind)).toBe("mail");
  });
});

describe("voucher plans toggle wiring", () => {
  it("exposes one switch for all plans and persists it on portal_settings", () => {
    const panel = readFileSync("src/components/PlansPanel.tsx", "utf8");
    expect(panel).toMatch(/Real-time notifications/);
    expect(panel).toMatch(/saveTicketActivationPref/);
    expect(panel).toMatch(/<Switch/);
    expect(panel).toMatch(/groupVoucherPlans/);
    expect(panel).toMatch(/plan-group-/);

    const sql = readFileSync(
      "supabase/migrations/20260818184500_ticket_activation_alerts.sql",
      "utf8",
    );
    expect(sql).toMatch(/notify_ticket_activation/);
  });

  it("does not send Telegram for voucher uses", () => {
    const server = readFileSync("src/lib/voucher-activation.server.ts", "utf8");
    expect(server).not.toMatch(/telegram/i);
    expect(server).not.toMatch(/sendOwnerMessage/);
  });
});
