import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/monetization.functions.ts", "utf8");
const revenueRoute = readFileSync("src/routes/_authenticated/app.revenue.tsx", "utf8");

describe("revenue voucher ledger limit", () => {
  it("uses bounded, paginated reads for the revenue dashboard", () => {
    expect(source).toContain("limit: z.number().int().min(1).max(1000).default(500)");
    expect(revenueRoute).toContain("limit: PAGE_SIZE");
    expect(revenueRoute).toContain("offset: (page - 1) * PAGE_SIZE");
  });

  it("keeps the downstream database read bounded", () => {
    expect(source).toContain(".limit(data.limit);");
  });
});
