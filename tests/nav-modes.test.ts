import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  availableModes,
  canAccessPath,
  navTitleForPath,
  modeForPath,
  navItemsForMode,
  visibleNavItems,
  primaryNavItems,
  PRIMARY_TAB_PATHS,
} from "@/lib/nav/modes";

const paths = (items: { to: string }[]) => items.map((i) => i.to);

describe("navigation modes — role visibility", () => {
  it("gives a client the three business tabs but no owner tools", () => {
    const items = visibleNavItems(["client"]);
    expect(paths(items)).toEqual(
      expect.arrayContaining(["/app", "/app/revenue", "/app/vouchers", "/app/portal"]),
    );
    expect(paths(items)).not.toContain("/app/users");
    expect(paths(items)).not.toContain("/app/scripts");
    expect(paths(items)).not.toContain("/app/terminal");
    expect(paths(items)).not.toContain("/app/agent");
    expect(paths(items)).not.toContain("/app/test-lab/sandbox");
  });

  it("gives a Business Owner the terminal and every owner-only tool", () => {
    const items = paths(visibleNavItems(["primary"]));
    expect(items).toContain("/app/terminal");
    expect(items).toContain("/app/audit");
  });

  it("keeps Reseller Operation available to every non-trial account", () => {
    expect(paths(visibleNavItems(["primary"]))).toContain("/app/reseller-operation");
    expect(paths(visibleNavItems(["client"]))).toContain("/app/reseller-operation");
    expect(paths(visibleNavItems(["agent"]))).toContain("/app/reseller-operation");
    expect(paths(visibleNavItems(["expired"]))).toContain("/app/reseller-operation");
    expect(paths(visibleNavItems(["client"], undefined, false, false, true))).not.toContain(
      "/app/reseller-operation",
    );
  });

  it("hides the removed sandbox lab from every role, including Business Owners", () => {
    for (const roles of [["client"], ["agent"], ["client", "expired"], ["expired"], ["primary"]]) {
      expect(paths(visibleNavItems(roles))).not.toContain("/app/test-lab/sandbox");
      expect(canAccessPath(roles, "/app/test-lab/sandbox")).toBe(false);
    }
    expect(paths(visibleNavItems(["primary"]))).toContain("/app/test-lab/real");
  });

  it("hides Quick setup and Connectors from User and Agent; Business Owner keeps them", () => {
    for (const roles of [["client"], ["agent"], ["client", "expired"], ["expired"]]) {
      expect(paths(visibleNavItems(roles))).not.toContain("/app/quick-setup");
      expect(canAccessPath(roles, "/app/quick-setup")).toBe(false);
      expect(paths(visibleNavItems(roles))).not.toContain("/app/connectors");
      expect(canAccessPath(roles, "/app/connectors")).toBe(false);
    }
    expect(paths(visibleNavItems(["primary"]))).toContain("/app/quick-setup");
    expect(canAccessPath(["primary"], "/app/quick-setup")).toBe(true);
    expect(paths(visibleNavItems(["primary"]))).toContain("/app/connectors");
    expect(canAccessPath(["primary"], "/app/connectors")).toBe(true);
  });

  it("shows Magic Coins to agents and owners only", () => {
    expect(paths(visibleNavItems(["agent"]))).toContain("/app/agent");
    expect(paths(visibleNavItems(["primary"]))).toContain("/app/agent");
    expect(paths(visibleNavItems(["client"]))).not.toContain("/app/agent");
  });

  it("keeps the read-only account and reseller entries visible to expired accounts", () => {
    expect(paths(visibleNavItems(["client", "expired"])).sort()).toEqual(
      ["/app", "/app/manual", "/app/profile", "/app/reseller-operation", "/app/services"].sort(),
    );
  });

  it("keeps optional AP integrations in Advanced instead of normal Operations", () => {
    const clientOperations = paths(navItemsForMode(["client"], "operations"));
    const clientAdvanced = paths(navItemsForMode(["client"], "advanced"));
    expect(clientOperations).not.toContain("/app/access-points");
    expect(clientAdvanced).toContain("/app/access-points");
    expect(NAV_ITEMS.find((item) => item.to === "/app/access-points")?.label).toBe(
      "AP integrations",
    );
    expect(availableModes(["client"])).toEqual(["business", "operations", "advanced"]);
    expect(availableModes(["primary"])).toEqual(["business", "operations", "advanced"]);
  });

  it("always keeps the pinned account tabs in every mode", () => {
    for (const mode of availableModes(["primary"])) {
      const items = paths(navItemsForMode(["primary"], mode));
      expect(items).toContain("/app/profile");
      expect(items).toContain("/app/manual");
    }
  });
});

describe("deep links keep working", () => {
  it("maps every non-pinned tab URL back to its own mode", () => {
    for (const item of NAV_ITEMS) {
      if (item.pinned) continue;
      expect(modeForPath(item.to)).toBe(item.mode);
    }
  });

  it("resolves nested and trailing-slash URLs", () => {
    expect(modeForPath("/app/routers/abc-123")).toBe("operations");
    expect(modeForPath("/app/vouchers/")).toBe("business");
    expect(modeForPath("/app")).toBe("business");
    expect(modeForPath("/app/unknown-page")).toBe("business");
  });

  it("still authorizes deep links by role", () => {
    expect(canAccessPath(["primary"], "/app/audit")).toBe(true);
    expect(canAccessPath(["client"], "/app/audit")).toBe(false);
    expect(canAccessPath(["client"], "/app/routers/xyz")).toBe(true);
  });
});

describe("compact mobile app bar title", () => {
  it("names the tab that owns the URL", () => {
    expect(navTitleForPath(["primary"], "/app/routers")).toBe("Routers");
    expect(navTitleForPath(["primary"], "/app/services")).toBe("Services");
    expect(navTitleForPath(["primary"], "/app/orders")).toBe("Payments");
  });

  it("uses the deepest matching tab for nested URLs", () => {
    expect(navTitleForPath(["primary"], "/app/routers/abc")).toBe("Routers");
  });

  it("falls back to the shell title for unknown or hidden paths", () => {
    expect(navTitleForPath(["client"], "/app/tenants")).toBe("Dashboard");
    expect(navTitleForPath(["primary"], "/app/nowhere")).toBe("Dashboard");
  });
});

describe("primary bottom tabs", () => {
  it("keeps Home / Revenue / Vouchers / Syslog AI in order for owners", () => {
    expect(PRIMARY_TAB_PATHS).toEqual([
      "/app",
      "/app/revenue",
      "/app/vouchers",
      "/app/voucher-layouts",
    ]);
    expect(paths(primaryNavItems(["primary"]))).toEqual([...PRIMARY_TAB_PATHS]);
  });

  it("keeps Fleet in Operations, off the bottom bar", () => {
    expect(PRIMARY_TAB_PATHS).not.toContain("/app/fleet");
    expect(PRIMARY_TAB_PATHS).not.toContain("/app/magic-dude");
    expect(NAV_ITEMS.find((i) => i.to === "/app/fleet")?.mode).toBe("operations");
    expect(paths(visibleNavItems(["primary"]))).toContain("/app/fleet");
    expect(paths(visibleNavItems(["primary"]))).not.toContain("/app/magic-dude");
  });

  it("drops Vouchers and Syslog for expired clients", () => {
    expect(paths(primaryNavItems(["client", "expired"]))).toEqual(["/app"]);
  });
});
