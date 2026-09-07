import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { isDirectRunPath } from "../src/agent/connector-agent.mjs";
import { AGENT_BUNDLE } from "../src/lib/connector-agent-artifact";

describe("connector agent direct-run detection", () => {
  it("matches a macOS path containing spaces", () => {
    const p = "/Library/Application Support/MikroMagicConnector/connector-agent.mjs";
    expect(pathToFileURL(p).href).toContain("%20");
    expect(isDirectRunPath(p, pathToFileURL(p).href)).toBe(true);
  });

  it("matches a Windows-style path", () => {
    const p =
      process.platform === "win32"
        ? "C:\\ProgramData\\MikroMagicConnector\\agent.mjs"
        : "/c/Program Files/MikroMagicConnector/agent.mjs";
    expect(isDirectRunPath(p, pathToFileURL(p).href)).toBe(true);
  });

  it("does not match a different module url", () => {
    const p = "/tmp/agent.mjs";
    expect(isDirectRunPath(p, "file:///tmp/other.mjs")).toBe(false);
    expect(isDirectRunPath(undefined as unknown as string, "file:///tmp/a.mjs")).toBe(false);
  });

  it("actually starts main() when run from a directory with a space in the name", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "mm-")), "Application Support");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "connector-agent.mjs");
    writeFileSync(file, AGENT_BUNDLE, { mode: 0o755 });

    let code = 0;
    let out = "";
    try {
      out = execFileSync(process.execPath, [file], {
        encoding: "utf8",
        env: { ...process.env, MIKROMAGIC_HOME: join(dir, "cfg"), MIKROMAGIC_PAIRING_CODE: "" },
        timeout: 20000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const e = err as { status: number; stdout?: string };
      code = e.status;
      out = e.stdout ?? "";
    }
    // main() ran and exited with 2 ("no pairing code") instead of silently idling.
    expect(code).toBe(2);
    expect(out).toContain("no pairing code");
  });
});
