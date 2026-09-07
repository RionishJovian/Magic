import { describe, expect, it } from "vitest";
import { canAccessPath, visibleNavItems, navItemsForMode } from "@/lib/nav/modes";
import { isPrivileged, requirePrivileged } from "@/lib/guards.server";

const paths = (items: { to: string }[]) => items.map((i) => i.to);

/** Minimal Supabase stub: only `user_roles` selects are used by the guard. */
function fakeSupabase(roles: string[]) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: roles.map((role) => ({ role })) }),
      }),
    }),
  } as never;
}

describe("back office is not a customer-facing tab", () => {
  it("hides /app/orders from every non-privileged role", () => {
    for (const roles of [["client"], ["agent"], ["read_only"], ["client", "expired"], []]) {
      expect(paths(visibleNavItems(roles))).not.toContain("/app/orders");
    }
  });

  it("shows /app/orders to owner and admin", () => {
    expect(paths(visibleNavItems(["primary"]))).toContain("/app/orders");
    expect(paths(visibleNavItems(["primary"]))).toContain("/app/orders");
  });

  it("shows /app/orders to a client granted cash_sales", () => {
    expect(paths(visibleNavItems(["client"], ["cash_sales"]))).toContain("/app/orders");
    expect(canAccessPath(["client"], "/app/orders", ["cash_sales"])).toBe(true);
  });

  it("surfaces Payments next to Revenue in Business mode", () => {
    expect(paths(navItemsForMode(["primary"], "business"))).toContain("/app/orders");
    expect(paths(navItemsForMode(["primary"], "advanced"))).not.toContain("/app/orders");
    expect(visibleNavItems(["primary"]).find((i) => i.to === "/app/orders")?.label).toBe(
      "Payments",
    );
  });
});

describe("deep-link authorization", () => {
  it("denies /app/orders and nested finance URLs to non-privileged roles", () => {
    expect(canAccessPath(["client"], "/app/orders")).toBe(false);
    expect(canAccessPath(["agent"], "/app/orders")).toBe(false);
    expect(canAccessPath(["read_only"], "/app/orders/abc")).toBe(false);
    expect(canAccessPath(["client", "expired"], "/app/orders")).toBe(false);
  });

  it("allows owner and admin", () => {
    expect(canAccessPath(["primary"], "/app/orders")).toBe(true);
    expect(canAccessPath(["primary"], "/app/orders/abc")).toBe(true);
  });

  it("does not surface a guest checkout path in operator nav", () => {
    expect(paths(visibleNavItems(["primary"]))).not.toContain("/portal/checkout");
    expect(paths(visibleNavItems(["client"]))).not.toContain("/portal/checkout");
  });
});

describe("server-side rejection of non-privileged finance calls", () => {
  it("rejects client, agent, read-only and expired accounts", async () => {
    for (const roles of [["client"], ["agent"], ["read_only"], ["client", "expired"]]) {
      expect(isPrivileged(roles)).toBe(false);
      await expect(requirePrivileged(fakeSupabase(roles), "u1")).rejects.toThrow(
        /primary café owner or a developer/i,
      );
    }
  });

  it("accepts primary tenant users", async () => {
    await expect(requirePrivileged(fakeSupabase(["primary"]), "u1")).resolves.toBeUndefined();
    await expect(requirePrivileged(fakeSupabase(["primary"]), "u1")).resolves.toBeUndefined();
  });
});
