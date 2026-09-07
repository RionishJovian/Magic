import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { SETUP_BUNDLE } from "@/lib/connector-setup-artifact";
import { AGENT_BUNDLE } from "@/lib/connector-agent-artifact";
import { verifyManifest } from "@/agent/connector-agent.mjs";
import {
  CONNECTOR_PRODUCTION_ORIGIN,
  connectorInstallOrigin,
} from "@/lib/connector-install-origin";

const MAC = readFileSync("src/agent/install/macos-install.sh", "utf8");
const WIN = readFileSync("src/agent/install/windows-install.ps1", "utf8");
const WIZARD = readFileSync("src/components/ConnectorWizard.tsx", "utf8");
const PAGE = readFileSync("src/routes/_authenticated/app.connectors.tsx", "utf8");

describe("client install commands are production-pinned", () => {
  for (const [name, src] of [
    ["ConnectorWizard", WIZARD],
    ["connectors page", PAGE],
  ] as const) {
    it(`${name} uses connectorInstallOrigin (production default, localhost override)`, () => {
      expect(src).toContain("connectorInstallOrigin");
      expect(src).not.toContain("window.location.origin");
      expect(src).not.toMatch(/\buseEffect\b/);
    });
  }

  it("connectorInstallOrigin pins production off localhost", () => {
    expect(connectorInstallOrigin("mikromagic.app", "https://mikromagic.app")).toBe(
      CONNECTOR_PRODUCTION_ORIGIN,
    );
    expect(connectorInstallOrigin("localhost", "http://localhost:5173")).toBe(
      "http://localhost:5173",
    );
    expect(connectorInstallOrigin("127.0.0.1", "http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000",
    );
  });
});

describe("installers pin and verify the Node.js runtime", () => {
  it("macOS checks the version and the published checksum", () => {
    expect(MAC).toContain("9e92ce1032455a9cc419fe71e908b27ae477799371b45a0844eedb02279922a4");
    expect(MAC).toContain("c5497dd17c8875b53712edaf99052f961013cedc203964583fc0cfc0aaf93581");
    expect(MAC).toContain("node_ok");
    expect(MAC).toContain("failed checksum verification");
  });

  it("Windows checks the version and the published checksum", () => {
    expect(WIN).toContain("56e5aacdeee7168871721b75819ccacf2367de8761b78eaceacdecd41e04ca03");
    expect(WIN).toContain("08987ceb478044b652ad57e15b96597e1eaf7f06502336b5a02c545f9e403ed6");
    expect(WIN).toContain("Test-NodeVersion");
    expect(WIN).toContain("failed checksum verification");
  });
});

describe("installers verify the signed manifest before installing", () => {
  for (const [name, src] of [
    ["macOS", MAC],
    ["Windows", WIN],
  ] as const) {
    it(`${name} verifies signature, origin and both artifact hashes`, () => {
      expect(src).toContain("MCowBQYDK2VwAyEACqzWWPJXbYAuE2WfbOb8USjBKEdYZ4W8ROiXB0yb3wE=");
      expect(src).toContain("manifest.setupSha256");
      expect(src).toContain("manifest.setupUrl");
      expect(src).toContain("release manifest points at an unexpected origin");
      expect(src).toContain("release manifest signature is invalid");
    });
  }

  it("macOS registers launchd only after verification passes", () => {
    expect(MAC.indexOf("could not be verified")).toBeLessThan(MAC.indexOf("launchctl bootstrap"));
    expect(MAC.indexOf("could not be verified")).toBeLessThan(MAC.indexOf("config.json"));
  });

  it("Windows creates the scheduled task only after verification passes", () => {
    expect(WIN.indexOf("could not be verified")).toBeLessThan(WIN.indexOf("schtasks /Create"));
    expect(WIN.indexOf("could not be verified")).toBeLessThan(WIN.indexOf("ConvertTo-Json"));
  });
});

describe("signed manifest covers agent and setup artifacts", () => {
  it("signature verifies and hashes match the served bundles", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const origin = "https://mikromagic.app";
    const manifest = {
      version: "1.0.0",
      sha256: createHash("sha256").update(AGENT_BUNDLE, "utf8").digest("hex"),
      url: `${origin}/api/public/connector/download`,
      setupSha256: createHash("sha256").update(SETUP_BUNDLE, "utf8").digest("hex"),
      setupUrl: `${origin}/api/public/connector/setup-tool`,
      algorithm: "ed25519",
    };
    const signature = cryptoSign(null, Buffer.from(JSON.stringify(manifest)), privateKey).toString(
      "base64",
    );
    const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");

    expect(verifyManifest(manifest, signature, pub)).toBe(true);
    expect(verifyManifest({ ...manifest, setupSha256: "deadbeef" }, signature, pub)).toBe(false);
    expect(manifest.setupSha256).not.toBe(manifest.sha256);
  });
});
