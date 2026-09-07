/** Covered in more depth by tests/user-facing-errors.test.ts — keep a thin smoke suite here. */
import { describe, expect, it } from "vitest";
import { toErrorMessage } from "@/lib/error-message";
import { friendlyDeviceError } from "@/lib/guards.server";

describe("toErrorMessage (sites smoke)", () => {
  it("never returns [object Object]", () => {
    expect(toErrorMessage({})).toBe("Something went wrong");
    expect(toErrorMessage({ message: "[object Object]" })).toBe("Something went wrong");
  });
});

describe("friendlyDeviceError (sites smoke)", () => {
  it("maps site quota to the owner-approved slot flow", () => {
    const err = friendlyDeviceError(
      { message: "DEVICE_QUOTA_EXCEEDED: this account already uses 1 of 1 allowed sites." },
      "sites",
    );
    expect(err.message).toMatch(/limit of site/i);
    expect(err.message).toMatch(/request another slot/i);
  });
});
