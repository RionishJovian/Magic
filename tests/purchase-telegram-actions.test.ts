import { describe, it, expect } from "vitest";
import { purchaseCallbackData, parsePurchaseCallback } from "@/lib/notify/purchase-tokens";

const MATERIAL = "123456789:AAExampleBotTokenValueThatIsLong";
const ID = "3f1c2b8e-9a4d-4c1f-8b2a-7d6e5f4c3b2a";

describe("telegram purchase actions", () => {
  it("fits inside Telegram's 64 byte callback_data limit", async () => {
    const data = await purchaseCallbackData("approve", ID, MATERIAL);
    expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
  });

  it("round-trips the purchase id and action", async () => {
    for (const action of ["approve", "reject"] as const) {
      const data = await purchaseCallbackData(action, ID, MATERIAL);
      await expect(parsePurchaseCallback(data, MATERIAL)).resolves.toEqual({
        action,
        purchaseId: ID,
      });
    }
  });

  it("rejects a forged or cross-credential payload", async () => {
    const data = await purchaseCallbackData("approve", ID, MATERIAL);
    await expect(parsePurchaseCallback(data, "other-secret")).resolves.toBeNull();
    await expect(parsePurchaseCallback(`${data.slice(0, -1)}0`, MATERIAL)).resolves.toBeNull();
    await expect(parsePurchaseCallback("ok:abc", MATERIAL)).resolves.toBeNull();
  });

  it("returns nothing when no bot credential is configured", async () => {
    expect(await purchaseCallbackData("approve", ID, "")).toBe("");
    await expect(parsePurchaseCallback("sok:x:y", "")).resolves.toBeNull();
  });
});
