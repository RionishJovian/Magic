import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  enforcementTarget,
  enforceVoucherTarget,
  terminalVoucherReason,
} from "@/lib/voucher-enforcement.server";

const voucher = (over: Partial<Parameters<typeof enforcementTarget>[0]["voucher"]> = {}) => ({
  id: "v1",
  code: "VCH-1D-ABC",
  owner_id: "owner-1",
  router_id: "router-1",
  status: "active",
  expires_at: null,
  ...over,
});

describe("RouterOS voucher enforcement", () => {
  it("uses active-session termination plus disablement, never persistent-user deletion", () => {
    const source = readFileSync("src/routes/api/public/hooks/voucher-maintenance.ts", "utf8");
    expect(source).toContain("VOUCHER_MAINTENANCE_EXCLUDED_ROUTER_IDS");
    expect(source.indexOf("excludedRouterIds.has(routerId)")).toBeLessThan(
      source.indexOf("summary.routers++"),
    );
    expect(source).toContain("routerAPI.removeActive");
    expect(source).toContain("routerAPI.patchUser");
    expect(readFileSync("src/lib/voucher-enforcement.server.ts", "utf8")).toContain(
      'disabled: "yes"',
    );
    expect(source).not.toContain("routerAPI.deleteUser");
  });

  it("keeps an active valid voucher out of enforcement", () => {
    expect(
      enforcementTarget({
        voucher: voucher(),
        routerId: "router-1",
        users: [{ ".id": "*u1", name: "VCH-1D-ABC" }],
        active: [{ ".id": "*a1", user: "VCH-1D-ABC" }],
      }),
    ).toBeNull();
  });

  it("targets an expired active session and its persistent user", () => {
    const result = enforcementTarget({
      voucher: voucher({ expires_at: "2020-01-01T00:00:00.000Z" }),
      routerId: "router-1",
      users: [{ ".id": "*u1", name: "VCH-1D-ABC", disabled: "no" }],
      active: [{ ".id": "*a1", user: "VCH-1D-ABC" }],
      now: Date.parse("2021-01-01T00:00:00.000Z"),
    });
    expect(result).toMatchObject({
      reason: "expired",
      target: { userId: "*u1", activeId: "*a1", userDisabled: false },
    });
  });

  it("rejects cancelled vouchers and never crosses router identity", () => {
    expect(
      enforcementTarget({
        voucher: voucher({ status: "cancelled" }),
        routerId: "router-2",
        users: [{ ".id": "*u1", name: "VCH-1D-ABC" }],
        active: [{ ".id": "*a1", user: "VCH-1D-ABC" }],
      }),
    ).toBeNull();
    expect(terminalVoucherReason({ status: "cancelled", expires_at: null })).toBe("cancelled");
  });

  it("does not target trial/default users", () => {
    expect(
      enforcementTarget({
        voucher: voucher({ code: "default-trial", expires_at: "2020-01-01T00:00:00Z" }),
        routerId: "router-1",
        users: [{ ".id": "*u1", name: "default-trial" }],
        active: [{ ".id": "*a1", user: "default-trial" }],
      }),
    ).toBeNull();
  });

  it("terminates active access before disabling, without deleting the user", async () => {
    const removeActive = vi.fn().mockResolvedValue(undefined);
    const patchUser = vi.fn().mockResolvedValue(undefined);
    const outcome = await enforceVoucherTarget({
      conn: {} as never,
      target: {
        voucherId: "v1",
        routerId: "router-1",
        voucherCode: "VCH-1D-ABC",
        userId: "*u1",
        activeId: "*a1",
        userDisabled: false,
      },
      removeActive,
      patchUser,
    });
    expect(outcome).toBe("targeted");
    expect(removeActive).toHaveBeenCalledBefore(patchUser);
    expect(patchUser).toHaveBeenCalledWith(expect.anything(), "*u1", { disabled: "yes" });
  });

  it("is safe to retry after a lost/late disconnect response", async () => {
    const removeActive = vi.fn().mockRejectedValue(new Error("404 not found"));
    const patchUser = vi.fn().mockResolvedValue(undefined);
    await expect(
      enforceVoucherTarget({
        conn: {} as never,
        target: {
          voucherId: "v1",
          routerId: "router-1",
          voucherCode: "VCH-1D-ABC",
          userId: "*u1",
          activeId: "*a1",
          userDisabled: false,
        },
        removeActive,
        patchUser,
      }),
    ).resolves.toBe("targeted");
    expect(patchUser).toHaveBeenCalledOnce();
  });

  it("does not cascade after an already disabled, already disconnected target", async () => {
    const removeActive = vi.fn();
    const patchUser = vi.fn();
    await expect(
      enforceVoucherTarget({
        conn: {} as never,
        target: {
          voucherId: "v1",
          routerId: "router-1",
          voucherCode: "VCH-1D-ABC",
          userId: "*u1",
          activeId: null,
          userDisabled: true,
        },
        removeActive,
        patchUser,
      }),
    ).resolves.toBe("already_enforced");
    expect(removeActive).not.toHaveBeenCalled();
    expect(patchUser).not.toHaveBeenCalled();
  });
});
