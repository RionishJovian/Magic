import { describe, expect, it } from "vitest";
import { isValidPassword, passwordSchema } from "@/lib/password-policy";

describe("account password policy", () => {
  it("accepts six or more characters containing a letter and a number", () => {
    expect(isValidPassword("magic1")).toBe(true);
    expect(passwordSchema().parse("Magic2026")).toBe("Magic2026");
  });

  it("rejects short, letters-only, and numbers-only passwords", () => {
    for (const password of ["abc12", "abcdef", "123456"]) {
      expect(isValidPassword(password)).toBe(false);
      expect(passwordSchema().safeParse(password).success).toBe(false);
    }
  });
});
