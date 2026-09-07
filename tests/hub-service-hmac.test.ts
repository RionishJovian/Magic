import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalString,
  hmacKeyCandidates,
  probeHubAuth,
  signRequest,
  VPS_UNAUTHORIZED,
} from "@/lib/wireguard/vps.server";

describe("hub service.mjs HMAC contract", () => {
  it("strips nginx /internal/provisioner prefix for routing + HMAC", async () => {
    const { normalizeProvisionerPath, cleanEnvValue } =
      await import("../deploy/mikromagic-hub/service.mjs");
    expect(normalizeProvisionerPath("/internal/provisioner/v1/peers/by-router/r1")).toBe(
      "/v1/peers/by-router/r1",
    );
    expect(normalizeProvisionerPath("/v1/peers/by-router/r1")).toBe("/v1/peers/by-router/r1");
    expect(
      cleanEnvValue('"7f64eceed6270af65df64b7827a2a7e490262e2407539009c7eb7bff6005296c"'),
    ).toBe("7f64eceed6270af65df64b7827a2a7e490262e2407539009c7eb7bff6005296c");
    expect(cleanEnvValue('"v1"')).toBe("v1");
  });

  it("accepts signatures produced by the app signer (hex key bytes)", async () => {
    const { verifySignature, canonicalString: hubCanon } =
      await import("../deploy/mikromagic-hub/service.mjs");
    const hex = "7f64eceed6270af65df64b7827a2a7e490262e2407539009c7eb7bff6005296c";
    const parts = {
      method: "PUT",
      path: "/v1/peers/by-router/r1",
      timestamp: "2026-08-21T08:00:00.000Z",
      requestId: "req-1",
      scope: "peers:create",
      tenantId: "t1",
      routerId: "r1",
      requestedBy: "u1",
      body: '{"tenantId":"t1"}',
    };
    const canonical = canonicalString(parts);
    expect(hubCanon(parts)).toBe(canonical);
    const sig = signRequest(hex, canonical);
    expect(verifySignature({ secret: hex, canonical, signature: sig })).toBe(true);
    expect(verifySignature({ secret: hex, canonical, signature: "deadbeef" })).toBe(false);
  });

  it("accepts UTF-8-of-hex signatures when the hub tries both key materials", async () => {
    const { verifySignature } = await import("../deploy/mikromagic-hub/service.mjs");
    const hex = "7f64eceed6270af65df64b7827a2a7e490262e2407539009c7eb7bff6005296c";
    const canonical = "PUT\n/v1/peers/by-router/r1\n";
    const utf8Sig = createHmac("sha256", hex)
      .update(canonical)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifySignature({ secret: hex, canonical, signature: utf8Sig })).toBe(true);
    expect(hmacKeyCandidates(hex)).toHaveLength(2);
  });
});

describe("probeHubAuth", () => {
  it("reports unauthorized without leaking the secret", async () => {
    const secret = "s3cr3t-signing-value-not-for-ui";
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => '{"error":"unauthorized"}',
      }) as unknown as Response) as unknown as typeof fetch;

    const probe = await probeHubAuth({
      env: {
        VPS_ROUTER_API_URL: "https://hub.example/internal/provisioner",
        VPS_ROUTER_API_SIGNING_SECRET: secret,
        VPS_ROUTER_API_KEY_ID: "v1",
      } as unknown as NodeJS.ProcessEnv,
      fetchImpl,
    });
    expect(probe.configured).toBe(true);
    expect(probe.hubBodyKind).toBe("unauthorized");
    expect(probe.message).toBe(VPS_UNAUTHORIZED);
    expect(JSON.stringify(probe)).not.toContain(secret);
    expect(probe.message).toMatch(/service\.mjs|hmac-selftest/i);
  });
});
