import { describe, expect, it } from "vitest";
import {
  allocateUniqueCodes,
  expiresAtFromValidityDays,
  randomCode,
  VOUCHER_CODE_ALPHABET,
} from "@/lib/portal/voucher-codes";
import { hotspotUserToCli } from "@/lib/mikrotik.server";
import { readFileSync } from "node:fs";

describe("voucher code helpers", () => {
  it("uses an unambiguous alphabet", () => {
    expect(VOUCHER_CODE_ALPHABET).not.toMatch(/[IO01]/);
    expect(randomCode(8)).toHaveLength(8);
    expect([...randomCode(12)].every((c) => VOUCHER_CODE_ALPHABET.includes(c))).toBe(true);
  });

  it("allocates unique codes against an existing set", () => {
    let n = 0;
    const codes = allocateUniqueCodes({
      count: 3,
      existing: new Set(["AAAA1111", "BBBB2222"]),
      generate: () => {
        n += 1;
        if (n === 1) return "AAAA1111"; // collision
        if (n === 2) return "CCCC3333";
        if (n === 3) return "DDDD4444";
        return "EEEE5555";
      },
    });
    expect(codes).toEqual(["CCCC3333", "DDDD4444", "EEEE5555"]);
  });

  it("builds unused-stock expiry from validity_days", () => {
    const now = Date.parse("2026-08-20T12:00:00.000Z");
    expect(expiresAtFromValidityDays(null, now)).toBeNull();
    expect(expiresAtFromValidityDays(0, now)).toBeNull();
    expect(expiresAtFromValidityDays(1, now)).toBe("2026-08-21T12:00:00.000Z");
  });
});

describe("hotspotUserToCli", () => {
  it("includes comment for plan tagging (stripped on boards that reject it)", () => {
    const cli = hotspotUserToCli({
      name: "ABCD1234",
      password: "ABCD1234",
      profile: "mm-1h",
      comment: "mm-plan:1h",
    });
    expect(cli).toContain("comment=");
    expect(cli).toContain("mm-plan:1h");
  });
});

describe("voucher generation contracts", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("issues ledger-first with router rollback on failure", () => {
    const issue = read("src/lib/portal.functions.ts");
    expect(issue).toContain('from("voucher_codes")');
    expect(issue).toContain(".insert({");
    expect(issue).toContain("routerAPI.addUser");
    expect(issue).toContain('.from("voucher_codes").delete()');
    expect(issue).toContain("allocateUniqueCodes");
    expect(issue).toContain("expiresAtFromValidityDays");
    expect(issue).toContain("site_id: siteId");
    expect(issue).not.toMatch(/insErr && !insErr\.message\.includes\("duplicate"\)/);
  });

  it("ensures HotSpot profile before paid fulfilment addUser", () => {
    const orders = read("src/lib/payments/orders.server.ts");
    expect(orders).toContain("ensurePlanProfileOnRouter");
    expect(orders).toContain("expiresAtFromValidityDays");
  });
});
