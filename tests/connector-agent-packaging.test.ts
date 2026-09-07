import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSetupBundle } from "@/lib/connector-bundle";

/**
 * The installers and the self-updater download ONE file. This suite proves the
 * artifact they get is self-contained: it parses, has no unresolved relative
 * imports, and actually boots in a fresh empty directory.
 */

const AGENT_MODULE_FILES = ["src/agent/lib/token-store.mjs", "src/agent/connector-agent.mjs"];

const SETUP_MODULE_FILES = [
  ...[
    "redact",
    "retry",
    "net",
    "mndp",
    "state",
    "token-store",
    "routeros",
    "bootstrap",
    "discovery",
  ].map((f) => `src/agent/lib/${f}.mjs`),
  "src/agent/setup-cli.mjs",
];

function agentBundle(): string {
  return buildSetupBundle(
    AGENT_MODULE_FILES.map((f) => readFileSync(f, "utf8")),
    [
      "// MikroMagic Connector Agent (generated self-contained bundle).",
      "// Dependencies are inlined; this file runs on a bare Node.js 18+ install.",
    ],
  );
}

/** A brand-new machine: one empty directory containing only the download. */
function freshInstall(source: string, name: string) {
  const dir = mkdtempSync(join(tmpdir(), "mm-fresh-"));
  const file = join(dir, name);
  writeFileSync(file, source);
  return { dir, file };
}

describe("connector agent artifact packaging", () => {
  it("inlines relative dependencies so nothing is fetched at runtime", () => {
    const src = agentBundle();
    expect(src).not.toMatch(/from\s*["']\.\.?\//);
    expect(src).toContain("migratePlaintextToken");
    expect(src).toContain("AGENT_VERSION");
  });

  it("passes node --check in a fresh empty directory", () => {
    const { file } = freshInstall(agentBundle(), "connector-agent.mjs");
    expect(() => execFileSync(process.execPath, ["--check", file])).not.toThrow();
  });

  it("starts far enough to prove no module is missing", () => {
    const { dir, file } = freshInstall(agentBundle(), "connector-agent.mjs");
    const res = spawnSync(process.execPath, [file], {
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        MIKROMAGIC_HOME: dir,
        MIKROMAGIC_PAIRING_CODE: "",
        MIKROMAGIC_BASE_URL: "https://mikromagic.invalid",
      },
    });
    const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    expect(out).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(out).not.toContain("Cannot find module");
    // No pairing code configured -> the agent logs and exits with code 2.
    expect(out).toContain("no pairing code");
    expect(res.status).toBe(2);
  });

  it("the version manifest SHA is computed over the runnable artifact", async () => {
    const src = agentBundle();
    const sha = createHash("sha256").update(src, "utf8").digest("hex");
    const { AGENT_BUNDLE } = await import("@/lib/connector-agent-artifact");
    expect(createHash("sha256").update(AGENT_BUNDLE, "utf8").digest("hex")).toBe(sha);
  });

  it("the setup tool artifact also parses in a fresh directory", () => {
    const src = buildSetupBundle(SETUP_MODULE_FILES.map((f) => readFileSync(f, "utf8")));
    const { file } = freshInstall(src, "connector-setup.mjs");
    expect(() => execFileSync(process.execPath, ["--check", file])).not.toThrow();
  });
});

const BASE = process.env["LIVE_BASE_URL"] ?? "http://localhost:8080";

async function tryFetch(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

describe("live-served connector artifacts", () => {
  it("the served agent download runs node --check and is self-contained", async () => {
    const body = await tryFetch("/api/public/connector/download");
    if (!body) return; // dev server not running in this environment
    expect(body).not.toMatch(/from\s*["']\.\.?\//);
    const { file } = freshInstall(body, "connector-agent.mjs");
    expect(() => execFileSync(process.execPath, ["--check", file])).not.toThrow();
    expect(createHash("sha256").update(body, "utf8").digest("hex")).toBe(
      createHash("sha256").update(agentBundle(), "utf8").digest("hex"),
    );
  });

  it("the served setup tool runs node --check", async () => {
    const body = await tryFetch("/api/public/connector/setup-tool");
    if (!body) return;
    const { file } = freshInstall(body, "connector-setup.mjs");
    expect(() => execFileSync(process.execPath, ["--check", file])).not.toThrow();
  });
});
