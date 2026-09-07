import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const JOBS = readFileSync("src/routes/api/public/connector/jobs.ts", "utf8");
const PAIR = readFileSync("src/routes/api/public/connector/pair.ts", "utf8");
const PAIRING_FN = readFileSync("src/lib/connectors.functions.ts", "utf8");
const AGENT = readFileSync("src/agent/connector-agent.mjs", "utf8");
const SAVE = readFileSync("src/lib/routers.functions.ts", "utf8");
const PROBE = readFileSync("src/lib/mikrotik.functions.ts", "utf8");
const SHELL = readFileSync("src/routes/_authenticated/app.tsx", "utf8");
const LOAD = readFileSync("src/lib/router-conn.server.ts", "utf8");

describe("phase 1 connector honesty", () => {
  it("saveRouter skips assertSafeEndpoint when connectorId is set", () => {
    expect(SAVE).toContain("assertConnectorLanEndpoint");
    expect(SAVE).toMatch(/if \(data\.connectorId\)[\s\S]*assertConnectorLanEndpoint/);
  });

  it("saveRouter uses hub label validation for Magic Hub (allows CGNAT)", () => {
    expect(SAVE).toContain("assertHubHostLabel");
    expect(SAVE).toContain('connectionMethod === "hub"');
    expect(SAVE).toContain('connection_mode: "hub"');
    expect(SAVE).toContain("runProvisionHubPeer");
    expect(SAVE).toContain("runTeardownHubPeer");
  });

  it("loadRouterConn refuses direct dial when Magic Hub has no peer", () => {
    expect(LOAD).toContain("Connect via Hub first");
    expect(LOAD).toContain("cloudRestBase");
  });

  it("job claim requires status=queued on update", () => {
    expect(JOBS).toContain('.eq("status", "queued")');
    expect(JOBS).toContain("claimed_at");
  });

  it("pairing consumes the code atomically by hash", () => {
    expect(PAIR).toContain('.eq("pairing_code_hash", codeHash)');
    expect(PAIR).toContain(".maybeSingle()");
  });

  it("minting a pairing code clears the old agent token", () => {
    expect(PAIRING_FN).toMatch(/generatePairingCode[\s\S]*token_hash:\s*null/);
    expect(PAIRING_FN).toMatch(/generatePairingCode[\s\S]*status:\s*"unpaired"/);
  });

  it("agent retries result POSTs instead of swallowing them", () => {
    expect(AGENT).toContain("withRetry");
    expect(AGENT).toContain("failed to report job result");
    expect(AGENT).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
  });

  it("cloud probes refuse private LAN dials", () => {
    expect(PROBE).toContain("refusePrivateCloudDial");
  });

  it("loadRouterConn passes discovered TLS fingerprints", () => {
    expect(LOAD).toContain("tls_fingerprint");
    expect(LOAD).toContain("tlsFingerprint");
  });

  it("mode switch navigates and cosmetic tenant view-as is removed", () => {
    expect(SHELL).toContain("navigate({ to: first })");
    expect(SHELL).not.toContain("Viewing as tenant");
    expect(SHELL).not.toContain("useSelectedTenant");
  });
});
