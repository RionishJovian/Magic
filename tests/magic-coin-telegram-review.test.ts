import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/services.functions.ts", "utf8");
const magicCoinCheckout = source.slice(
  source.indexOf("export const submitMagicCoinPurchase"),
  source.indexOf("export const serviceReceiptUrl"),
);

describe("Magic Coin Telegram review", () => {
  it("sends the same signed Telegram review controls as a service purchase", () => {
    expect(magicCoinCheckout).toContain("sendPurchaseReview");
    expect(magicCoinCheckout).toContain('purchaseCallbackData("approve", row.id, material)');
    expect(magicCoinCheckout).toContain('purchaseCallbackData("reject", row.id, material)');
  });

  it("identifies the coin quantity and MMK total for the reviewer", () => {
    expect(magicCoinCheckout).toContain("New Magic Coin purchase awaiting review");
    expect(magicCoinCheckout).toContain("Magic Coins");
    expect(magicCoinCheckout).toContain("MMK");
  });
});
