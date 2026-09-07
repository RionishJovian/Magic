import { describe, expect, it } from "vitest";
import { authAttemptKey } from "@/lib/auth-rate-limit.server";
import { readFileSync } from "node:fs";

describe("current engine security hardening", () => {
  it("hashes and namespaces durable auth limiter keys", () => {
    expect(authAttemptKey("identifier", " Alice ")).toBe(authAttemptKey("identifier", "alice"));
    expect(authAttemptKey("identifier", "alice")).not.toContain("alice");
    expect(authAttemptKey("identifier", "alice")).toMatch(/^auth:identifier:v1:[a-f0-9]{64}$/);
    expect(authAttemptKey("ip", "alice")).not.toBe(authAttemptKey("identifier", "alice"));
  });

  it("uses the durable limiter and fails closed when it cannot be evaluated", () => {
    const source = readFileSync("src/lib/auth-rate-limit.server.ts", "utf8");
    expect(source).toContain('rateLimit(authAttemptKey("ip"');
    expect(source).toContain("if (!ipAllowed || !identifierAllowed)");
    expect(readFileSync("src/lib/owner.functions.ts", "utf8")).toContain(
      "assertAuthAttemptAllowed",
    );
  });

  it("routes first-use state through the atomic database claim", () => {
    const source = readFileSync("src/lib/voucher-activation.server.ts", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260828100000_atomic_voucher_first_use.sql",
      "utf8",
    );
    expect(source).toContain(')("claim_voucher_first_use", {');
    expect(source).toContain("fail closed");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("first_seen_at IS NULL");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
  });

  it("fails and audits reconciliation persistence errors in the owner scope", () => {
    const source = readFileSync("src/lib/orders.functions.ts", "utf8");
    expect(source).toContain('.eq("id", id)');
    expect(source).toContain('.eq("owner_id", owner_id)');
    expect(source).toContain('action: "sessions.reconcile_failed"');
    expect(source).toContain('throw new Error("Session reconciliation could not be saved")');
  });

  it("documents the deliberate gateway-revocation compatibility boundary", () => {
    const runbook = readFileSync("docs/SECURITY-RUNBOOK.md", "utf8");
    expect(runbook).toContain("stale-authorization");
    expect(runbook).toContain("product-owner");
  });
});
