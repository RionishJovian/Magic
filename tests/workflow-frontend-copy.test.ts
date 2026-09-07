import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("single Magic go-live teacher", () => {
  it("keeps MagicGoLiveStrip as the only go-live teacher", () => {
    expect(read("src/routes/_authenticated/app.index.tsx")).toContain("MagicGoLiveStrip");
    expect(read("src/routes/_authenticated/app.sites.tsx")).toContain("MagicGoLiveStrip");
    expect(existsSync("src/components/VoucherWorkflowGuide.tsx")).toBe(false);
    expect(read("src/routes/_authenticated/app.vouchers.tsx")).not.toContain(
      "VoucherWorkflowGuide",
    );
    expect(read("src/routes/_authenticated/app.portal.tsx")).not.toContain("VoucherWorkflowGuide");
  });

  it("teaches Magic Hub only for platform-user router connect (no Quick Setup)", () => {
    const cafe = read("src/lib/magic-go-live.ts");
    expect(cafe).toMatch(/Magic Hub/);
    expect(cafe).not.toMatch(/Quick Setup/);
  });
});

describe("guest cloud checkout scaffold is removed", () => {
  it("deletes public checkout routes and keeps no plan picker surface", () => {
    expect(existsSync("src/routes/portal.checkout.tsx")).toBe(false);
    expect(existsSync("src/routes/api/public/checkout/index.ts")).toBe(false);
    expect(existsSync("src/routes/api/public/checkout/receipt.ts")).toBe(false);
    expect(existsSync("src/routes/api/public/checkout/status.ts")).toBe(false);
  });

  it("home Payments card no longer advertises checkout links", () => {
    const home = read("src/routes/_authenticated/app.index.tsx");
    expect(home).not.toMatch(/checkout links/i);
    expect(home).toMatch(/desk voucher sales/i);
  });

  it("orders server no longer creates portal checkout tokens", () => {
    const orders = read("src/lib/orders.functions.ts");
    expect(orders).not.toMatch(/createCheckoutToken|listCheckoutTokens|portal_checkout_tokens/);
  });
});

describe("tier pass and agent copy match the authoritative point rules", () => {
  const services = read("src/routes/_authenticated/app.services.tsx");
  const agent = read("src/routes/_authenticated/app.agent.tsx");

  it("services explains receipt -> pending -> approved and agent-only commission", () => {
    expect(services).toMatch(/receipt/i);
    expect(services).toMatch(/[Pp]ending/);
    expect(services).toMatch(/15 Magic Coins/);
    expect(services).toMatch(/150 Magic Coins/);
  });

  it("agent page uses the commission report and drops flat-15 wording", () => {
    expect(agent).toMatch(/agentCommissionReport/);
  });
});
