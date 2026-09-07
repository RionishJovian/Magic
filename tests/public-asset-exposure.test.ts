import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public leftover assets + cron backup auth", () => {
  it("does not ship internal i18n rules from the public/ root", () => {
    expect(() => readFileSync("public/i18n-rules.md", "utf8")).toThrow();
    expect(readFileSync("src/content/i18n-rules.md", "utf8")).toMatch(/i18n rules/i);
    const page = readFileSync("src/routes/_authenticated/app.i18n.tsx", "utf8");
    expect(page).toContain("@/content/i18n-rules.md?raw");
    expect(page).not.toContain('href="/i18n-rules.md"');
  });

  it("gates the db-backup hook with the shared cron secret helper", () => {
    const hook = readFileSync("src/routes/api/public/hooks/db-backup.ts", "utf8");
    expect(hook).toContain("isAuthorizedCronRequest");
    expect(hook).not.toMatch(/SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY/);
    expect(hook).not.toMatch(/headers\.get\("apikey"\)/);
  });

  it("runs platform-admin backups in-process without the public anon key", () => {
    const fn = readFileSync("src/lib/backups.functions.ts", "utf8");
    expect(fn).toContain("runDbBackupSnapshot");
    expect(fn).not.toMatch(/SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY/);
    expect(fn).not.toContain("/api/public/hooks/db-backup");
  });
});
