import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GRANTABLE_FEATURES } from "@/lib/operator-features";

describe("Telegram belongs to Business Owner / Dev", () => {
  it("is not an operations grant Users can receive", () => {
    expect(GRANTABLE_FEATURES).not.toContain("telegram");
  });

  it("gates setup APIs on Business Owner", () => {
    const src = readFileSync("src/lib/telegram.functions.ts", "utf8");
    expect(src).toMatch(/requirePrivileged/);
    expect(src).not.toMatch(/requireFeature/);
  });

  it("keeps the linking panel on Services for privileged reviewers", () => {
    const services = readFileSync("src/routes/_authenticated/app.services.tsx", "utf8");
    expect(services).toMatch(/TelegramSetupPanel/);
    expect(services).toMatch(/privileged &&/);

    const orders = readFileSync("src/routes/_authenticated/app.orders.tsx", "utf8");
    expect(orders).not.toMatch(/TelegramSetupPanel/);
  });

  it("pings Telegram for Tier Pass purchases, not guest hotspot receipts", () => {
    const services = readFileSync("src/lib/services.functions.ts", "utf8");
    expect(services).toMatch(/sendPurchaseReview/);
    expect(services).toMatch(/in\("role", \[TENANT_PRIMARY_ROLE\]\)/);
    expect(services).toMatch(/isPlatformAdminUser/);

    const guest = readFileSync("src/lib/payments/review.server.ts", "utf8");
    expect(guest).not.toMatch(/telegramNotifier/);
    expect(guest).not.toMatch(/notifyReceipt/);
  });

  it("limits Services checkout banks to platform_admins (Dev), not every Business Owner", () => {
    const services = readFileSync("src/lib/services.functions.ts", "utf8");
    const bankFn = services.slice(
      services.indexOf("developerBankAccounts"),
      services.indexOf("submitServicePurchase"),
    );
    expect(bankFn).toMatch(/isPlatformAdminUser/);
    expect(bankFn).toMatch(/platform_service_bank_accounts/);
    expect(bankFn).not.toMatch(/eq\("role", "primary"\)/);
  });
});
