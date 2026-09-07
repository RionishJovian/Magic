import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Magic Dude production chat route", () => {
  const route = readFileSync("src/routes/api/$chat.ts", "utf8");
  const auth = readFileSync("src/lib/api-auth.server.ts", "utf8");

  it("requires bearer authentication and the Magic Dude access gate", () => {
    expect(route).toContain("requireApiSupabaseAuth");
    expect(route).toContain("requireMagicDudeAccess");
    expect(auth).toContain('authorization.startsWith("Bearer ")');
    expect(auth).toContain("getClaims(token)");
  });

  it("accepts bounded user and assistant messages only", () => {
    expect(route).toContain('z.enum(["user", "assistant"])');
    expect(route).toContain("max(4_000)");
    expect(route).toContain("max(20)");
    expect(route).toContain('z.enum(["en", "my", "zh"])');
    expect(route).toContain("same language as the user's latest message");
    expect(route).toContain("MAGIC_DUDE_PRODUCT_KNOWLEDGE");
    expect(route).toContain("a little childish and cute");
    expect(route).toContain("smart, additive, polite, royal, and sharp");
    expect(route).toContain("Use short sentences");
    expect(route).toContain("Use 1–3 fitting emojis per reply");
    expect(route).toContain("solve the operator's MikroTik Magic problem");
    expect(route).toContain("Resolution-first response contract");
    expect(route).toContain("Start with the answer, diagnosis, or safest fix");
    expect(route).toContain('Do not answer only with "go to..." or "check..."');
    expect(route).toContain("Privacy and safety boundary");
    expect(route).toContain("personal guest identity");
  });

  it("builds context from tenant-scoped safe fields", () => {
    expect(route).toContain('from("router_connections")');
    expect(route).toContain('from("voucher_codes")');
    expect(route).toContain('from("incidents")');
    expect(route).toContain('from("portal_deploy_audit")');
    expect(route).toContain('from("payment_orders")');
    expect(route).toContain("last_7_days");
    expect(route).toContain(
      "Revenue is recognized only from eligible used or settled voucher activity",
    );
    expect(route).toContain("No passwords, tokens, ciphertext");
    expect(route).not.toContain("password_ciphertext");
  });

  it("keeps V1 read-only and enforces a daily cap", () => {
    expect(route).toContain("You are read-only");
    expect(route).toContain("DAILY_LIMIT = 30");
    expect(route).toContain("magic_dude_chat");
    expect(route).toContain("status: 429");
    expect(route).toContain("effectiveOwner");
  });

  it("does not use the local Ollama client or expose provider errors", () => {
    expect(route).not.toContain("ollama-client");
    expect(route).toContain("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(route).toContain("Magic Dude could not answer right now.");
  });

  it("grounds product questions in MikroTik Magic workflows", () => {
    const knowledge = readFileSync("src/lib/magic-dude-product-knowledge.ts", "utf8");
    expect(knowledge).toContain("created by Nish, a Burmese technician");
    expect(knowledge).toContain("gray-hat technician");
    expect(knowledge).toContain("help people complete hotspot-business work more easily");
    expect(knowledge).toContain("does not authorize intrusion");
    expect(knowledge).toContain("Vouchers: time plans, data plans, custom plans");
    expect(knowledge).toContain("Magic Hub / Cloud Remote");
    expect(knowledge).toContain("Mention RouterOS, WinBox, WebFig");
    expect(knowledge).toContain("only when the user specifically asks");
    expect(knowledge).toContain("Easy Mode is the guided operator workspace");
    expect(knowledge).toContain('"Easy mode" on the Easy dashboard');
    expect(knowledge).toContain("Default plans from MikroTik Magic and Custom plans");
    expect(knowledge).toContain("Both Time plans and Data plans are supported");
    expect(knowledge).toContain("Default layout for quick thermal printing");
    expect(knowledge).toContain("Voucher generation is a separate confirmation-gated action");
    expect(knowledge).toContain("Recommended operator journey");
    expect(knowledge).toContain("HTML injection");
    expect(knowledge).toContain("Solution playbooks:");
    expect(knowledge).toContain("active guests prove current access, not recognised income");
    expect(knowledge).toContain("mm-login-flood");
    expect(knowledge).toContain("saved is not published or applied");
  });

  it("supports a confirmation-gated voucher action on the existing chat endpoint", () => {
    expect(route).toContain('mode: z.literal("options")');
    expect(route).toContain('mode: z.literal("create")');
    expect(route).toContain("confirmation: z.literal(true)");
    expect(route).toContain("issuePlanVouchersForUser");
    expect(route).toContain('eq("owner_id", ownerId)');
  });
});
