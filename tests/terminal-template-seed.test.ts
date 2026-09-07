import { describe, expect, it } from "vitest";
import {
  TERMINAL_BUILTIN_TEMPLATES,
  TERMINAL_NEW_BUILTIN_NAMES,
} from "@/lib/terminal-template-seed";

describe("terminal builtin template seed", () => {
  it("defines unique template names", () => {
    const names = TERMINAL_BUILTIN_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses valid REST paths and methods", () => {
    for (const t of TERMINAL_BUILTIN_TEMPLATES) {
      expect(t.path.startsWith("/")).toBe(true);
      expect(/\s/.test(t.path)).toBe(false);
      expect(["GET", "POST", "PATCH", "PUT", "DELETE"]).toContain(t.method);
      if (t.body) expect(() => JSON.parse(t.body)).not.toThrow();
    }
  });

  it("covers useful operator sectors", () => {
    const categories = new Set(TERMINAL_BUILTIN_TEMPLATES.map((t) => t.category));
    for (const sector of [
      "system",
      "security",
      "hotspot",
      "network",
      "qos",
      "diagnostics",
      "backup",
    ]) {
      expect(categories.has(sector)).toBe(true);
    }
  });

  it("flags newly added built-ins for migration backfill docs", () => {
    for (const name of TERMINAL_NEW_BUILTIN_NAMES) {
      expect(TERMINAL_BUILTIN_TEMPLATES.some((t) => t.name === name)).toBe(true);
    }
  });
});
