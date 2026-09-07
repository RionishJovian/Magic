import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("responsive operational tables", () => {
  it("uses fixed columns and a scroll threshold for every audited data table", () => {
    for (const path of [
      "src/routes/_authenticated/app.syslog.tsx",
      "src/routes/_authenticated/app.devices.tsx",
      "src/routes/_authenticated/app.readiness.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("table-fixed");
      expect(source, path).toContain("<colgroup>");
      expect(source, path).toContain("table-scroll");
    }
  });

  it("protects Syslog metadata and actions from character-by-character wrapping", () => {
    const source = read("src/routes/_authenticated/app.syslog.tsx");
    expect(source).toContain("min-w-[1100px]");
    expect(source).toContain('whitespace-nowrap py-2 pr-3">Time');
    expect(source).toContain("break-words font-mono text-[11px]");
  });
});
