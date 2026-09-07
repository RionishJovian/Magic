import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canOperatePortalMode,
  enabledPaymentMethods,
  parsePaymentMethods,
  resolveAllowedPortalModes,
} from "@/lib/portal/modes";
import { mergeLoginBy } from "@/lib/portal/trial.server";
import { renderPortalFiles } from "@/lib/portal-template.server";

describe("portal mode permissions", () => {
  it("always allows voucher_only for clients", () => {
    const allowed = resolveAllowedPortalModes({
      roles: ["client"],
      userGrants: [],
      roleDefaults: [],
    });
    expect(allowed).toEqual(["voucher_only"]);
    expect(
      canOperatePortalMode("commerce", { roles: ["client"], userGrants: [], roleDefaults: [] }),
    ).toBe(false);
  });

  it("gives owner every mode", () => {
    expect(
      resolveAllowedPortalModes({ roles: ["primary"], userGrants: [], roleDefaults: [] }),
    ).toEqual(["voucher_only", "hybrid_light", "commerce"]);
  });

  it("merges role defaults and per-user grants", () => {
    const allowed = resolveAllowedPortalModes({
      roles: ["client"],
      userGrants: ["commerce"],
      roleDefaults: [{ role: "client", mode: "hybrid_light" }],
    });
    expect(allowed).toEqual(["voucher_only", "hybrid_light", "commerce"]);
  });
});

describe("portal mode enforcement boundaries", () => {
  it("enforces Hybrid Light and Guest Commerce in PostgreSQL, not only in the UI", () => {
    const migration = readFileSync(
      "supabase/migrations/20260826070000_harden_portal_mode_workflow.sql",
      "utf8",
    );
    expect(migration).toContain("can_operate_portal_guest_mode");
    expect(migration).toContain("portal_mode_grants");
    expect(migration).toContain("portal_mode_role_defaults");
    expect(migration).toContain("enforce_portal_guest_mode_grant");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF guest_mode");
  });

  it("allows Auth-triggered default seeding without weakening gated modes", () => {
    const migration = readFileSync(
      "supabase/migrations/20260831120000_fix_portal_seed_auth_guard.sql",
      "utf8",
    );
    expect(migration).toContain("IF NEW.guest_mode = 'voucher_only' THEN");
    expect(migration).toContain("current_setting('request.jwt.claim.role', true)");
    expect(migration).toContain("IF v_actor IS NULL THEN");
    expect(migration).toContain("PORTAL_MODE_AUTH_REQUIRED");
    expect(migration.indexOf("IF NEW.guest_mode = 'voucher_only' THEN")).toBeLessThan(
      migration.indexOf("IF v_actor IS NULL THEN"),
    );
  });

  it("checks the saved mode again before ZIP, probe, and publish operations", () => {
    const source = readFileSync("src/lib/portal.functions.ts", "utf8");
    for (const name of ["buildPortalZip", "getPortalDeployProbe", "publishPortalToRouter"]) {
      const start = source.indexOf(`export const ${name}`);
      const next = source.indexOf("export const ", start + 1);
      const handler = source.slice(start, next === -1 ? undefined : next);
      expect(handler, name).toContain("assertStoredPortalModeAccess");
    }
  });

  it("preserves unrelated saved portal settings when branding or assets change", () => {
    const source = readFileSync("src/lib/portal.functions.ts", "utf8");
    const save = source.slice(source.indexOf("export const savePortalSettings"));
    const upload = source.slice(source.indexOf("export const uploadPortalAsset"));
    expect(save.slice(0, 3500)).toContain("...(existing ?? {})");
    expect(upload.slice(0, 3000)).toContain("...(existing ?? {})");
  });

  it("exposes the existing audited plan editor on the portal page", () => {
    const page = readFileSync("src/routes/_authenticated/app.portal.tsx", "utf8");
    expect(page).toContain('import { PlansPanel } from "@/components/PlansPanel"');
    expect(page).toContain("<PlansPanel />");
  });
});

describe("portal device scan boundaries", () => {
  it("uses a read-only manifest scan and does not expose device HTML", () => {
    const functions = readFileSync("src/lib/portal.functions.ts", "utf8");
    const probe = readFileSync("src/lib/portal/portal-probe.server.ts", "utf8");
    const page = readFileSync("src/routes/_authenticated/app.portal.tsx", "utf8");
    expect(functions).toContain("export const scanPortalOnDevice");
    expect(functions).toContain("scanPortalOnRouter");
    expect(probe).toContain("SCANNABLE_PORTAL_FILES");
    expect(probe).toContain("never returned to the browser");
    expect(probe).toContain("MAX_SCANNED_TEXT_BYTES");
    expect(page).toContain("Scan portal on device");
  });
});

describe("custom payment methods", () => {
  it("parses custom method cards", () => {
    const methods = parsePaymentMethods([
      {
        id: "kbz",
        enabled: true,
        label: "KBZPay",
        description: "Pay with KBZPay",
        accentHex: "#1d4ed8",
        action: "pay_info",
        infoTitle: "KBZPay",
        infoBody: "09xxxxxxx",
        copyValue: "09xxxxxxx",
        sort: 0,
      },
    ]);
    expect(methods[0]?.label).toBe("KBZPay");
    expect(methods[0]?.action).toBe("pay_info");
  });

  it("maps legacy channel flags into methods", () => {
    const methods = parsePaymentMethods({ pix: true, whatsapp: true, pos: false, online: false });
    expect(methods.some((m) => m.action === "pay_info")).toBe(true);
    expect(methods.some((m) => m.action === "seller")).toBe(true);
    expect(methods.some((m) => m.action === "pos")).toBe(false);
  });

  it("hybrid_light only keeps seller and pos actions", () => {
    const methods = parsePaymentMethods(undefined);
    const hybrid = enabledPaymentMethods(methods, "hybrid_light");
    expect(hybrid.every((m) => m.action === "seller" || m.action === "pos")).toBe(true);
  });
});

describe("RouterOS trial login-by merge", () => {
  it("adds trial without dropping chap/pap", () => {
    expect(mergeLoginBy("http-chap,http-pap")).toContain("trial");
    expect(mergeLoginBy("http-chap,http-pap")).toContain("http-chap");
    expect(mergeLoginBy("https,trial")).toContain("http-chap");
  });
});

describe("portal template modes", () => {
  it("voucher_only login has no I don't have a code button", () => {
    const files = renderPortalFiles({
      businessName: "Cafe",
      welcomeText: "Hi",
      terms: "",
      primaryHex: "#112233",
      glassTintHex: "#445566",
      guestMode: "voucher_only",
    });
    const login = files.find((f) => f.name === "login.html")!.content;
    expect(login).toContain("voucher code");
    expect(login).toContain("this.password.value=this.username.value");
    expect(login).not.toContain("methods.html");
    expect(files.some((f) => f.name === "methods.html")).toBe(false);
  });

  it("hybrid_light ships help, seller and pos with ROS trial form", () => {
    const files = renderPortalFiles({
      businessName: "Cafe",
      welcomeText: "Hi",
      terms: "",
      primaryHex: "#112233",
      glassTintHex: "#445566",
      guestMode: "hybrid_light",
      sellerPhone: "+959123",
      posEntries: [{ name: "Shop A", address: "Main St", latitude: 16.8, longitude: 96.1 }],
    });
    const names = files.map((f) => f.name);
    expect(names).toContain("help.html");
    expect(names).toContain("seller.html");
    expect(names).toContain("pos.html");
    const seller = files.find((f) => f.name === "seller.html")!.content;
    expect(seller).toContain("$(link-login-only)");
    expect(seller).toContain("T-$(mac-esc)");
    expect(seller).toContain("$(if trial == 'yes')");
    expect(files.find((f) => f.name === "pos.html")!.content).toContain("geolocation");
  });

  it("commerce ships custom method cards and pay_info with trial", () => {
    const files = renderPortalFiles({
      businessName: "Cafe",
      welcomeText: "Hi",
      terms: "",
      primaryHex: "#112233",
      glassTintHex: "#445566",
      guestMode: "commerce",
      paymentMethods: [
        {
          id: "wave",
          enabled: true,
          label: "Wave Money",
          description: "Transfer via Wave",
          accentHex: "#f59e0b",
          action: "pay_info",
          infoTitle: "Wave account",
          infoBody: "09-WAVE-DEMO",
          copyValue: "09-WAVE-DEMO",
          sort: 0,
        },
        {
          id: "seller",
          enabled: true,
          label: "Seller chat",
          description: "Message us",
          accentHex: "#22c55e",
          action: "seller",
          infoTitle: "",
          infoBody: "",
          copyValue: "",
          sort: 1,
        },
      ],
      packages: [{ label: "1 hour", durationLabel: "60 min", priceLabel: "3,000 MMK" }],
    });
    const names = files.map((f) => f.name);
    expect(names).toContain("methods.html");
    expect(names).toContain("packages.html");
    expect(names).toContain("pay-wave.html");
    expect(files.find((f) => f.name === "methods.html")!.content).toContain("Wave Money");
    expect(files.find((f) => f.name === "methods.html")!.content).not.toContain("Via Pix");
    expect(files.find((f) => f.name === "pay-wave.html")!.content).toContain("T-$(mac-esc)");
    expect(files.find((f) => f.name === "packages.html")!.content).toContain("1 hour");
  });
});
