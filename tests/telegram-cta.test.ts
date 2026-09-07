import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("TelegramCta", () => {
  it("always enables the orbiting plane on marketing pills", () => {
    const cta = readFileSync("src/components/TelegramCta.tsx", "utf8");
    expect(cta).toContain("orbitingPlane");
    expect(cta).toContain("TELEGRAM_SUPPORT_URL");
  });

  it("is used for every public Telegram pill entry point", () => {
    for (const file of [
      "src/routes/index.tsx",
      "src/routes/pricing.tsx",
      "src/routes/auth.tsx",
      "src/routes/_authenticated/app.terminal.tsx",
      "src/routes/_authenticated/app.services.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("TelegramCta");
      expect(src, file).not.toContain("t.me/nish2769");
    }
  });
});
