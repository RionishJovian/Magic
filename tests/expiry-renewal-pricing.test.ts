import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("expiry renewal CTA", () => {
  it("Request renewal navigates to Services, not Pricing or Telegram", () => {
    const app = read("src/routes/_authenticated/app.tsx");
    const block = app.slice(
      app.indexOf("expiringSoon &&"),
      app.indexOf("Request renewal") + "Request renewal".length,
    );
    expect(block).toContain('to="/app/services"');
    expect(block).not.toContain('to="/pricing"');
    expect(block).not.toContain("t.me/nish2769");
  });
});
