import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MAGIC_DUDE_LOCKED_REASON, canUseMagicDude } from "@/lib/magic-dude-access";
import { magicDudeIntro, magicDudeResult, magicDudeWorking } from "@/lib/magic-dude-persona";
import { magicDudeRosGuide, missingRouterReadMessage } from "@/lib/magic-dude-ros-knowledge";

describe("Magic Dude safe support workflow", () => {
  const page = readFileSync("src/routes/_authenticated/app.magic-dude.tsx", "utf8");
  const fn = readFileSync("src/lib/magic-dude.functions.ts", "utf8");
  const popup = readFileSync("src/components/MagicDudeChatPopup.tsx", "utf8");

  it("offers the three supported customer checks", () => {
    expect(page).toContain('Navigate to="/app"');
    expect(page).toContain("floating assistant");
  });

  it("keeps the first release read-only and records each check", () => {
    expect(fn).toContain("probeWifiHotspot");
    expect(fn).toContain('action: "magic_dude_safe_check"');
    expect(fn).toContain("never writes RouterOS state");
  });

  it("enforces tenant ownership before reading router evidence", () => {
    expect(fn).toContain('.eq("owner_id", ownerId)');
    expect(fn).toContain("requireMagicDudeAccess");
  });

  it("locks User, Trial, and Expired accounts while exempting staff roles", () => {
    expect(canUseMagicDude(["client"])).toBe(false);
    expect(canUseMagicDude(["client"], false, true)).toBe(false);
    expect(canUseMagicDude(["expired"])).toBe(false);
    expect(canUseMagicDude(["primary"])).toBe(true);
    expect(canUseMagicDude(["agent"])).toBe(true);
    expect(canUseMagicDude(["client"], true)).toBe(true);
    expect(MAGIC_DUDE_LOCKED_REASON).toContain("active User account");
    expect(page).toContain("backwards-compatible redirect");
  });

  it("offers a server-enforced 30-day wallet unlock to locked accounts", () => {
    expect(fn).toContain("purchase_magic_dude_unlock");
    expect(fn).toContain("has_active_magic_dude_unlock");
    expect(fn).toContain('roles.includes("client") && !account.trial && !account.expired');
    expect(fn).toContain("30 days");
  });

  it("offers a working coin unlock and directs insufficient balances to Services", () => {
    expect(popup).toContain("Unlock for 30 days · 5 coins");
    expect(popup).toContain("Open Services to buy Magic Coins");
    expect(popup).toContain('href="/app/services"');
    expect(fn).toContain('throw new Error("You don\'t have sufficient coins")');
  });

  it("uses theatrical, memorized guidance with expressive states", () => {
    expect(magicDudeIntro("guests")).toMatchObject({ mood: "curious" });
    expect(magicDudeIntro("guests").line).toContain("If you would just");
    expect(magicDudeWorking()).toMatchObject({ mood: "thinking" });
    expect(magicDudeResult({ topic: "router", level: "block", title: "x" })).toMatchObject({
      mood: "afraid",
    });
    expect(magicDudeResult({ topic: "voucher", level: "warn", title: "x" })).toMatchObject({
      mood: "curious",
    });
    expect(page).not.toContain("MagicDudeCharacter");
    expect(page).not.toContain("mascot-v1.png");
    expect(popup).toContain("/magic-dude/magic-dude-boy-glasses.png");
    expect(popup).toContain("magic-dude-boy-glasses-blink.png");
    expect(popup).toContain("magic-dude-boy-glasses-wave.png");
    expect(popup).toContain("magic-dude-boy-glasses-wand.png");
    expect(popup).toContain("magic-dude-chat-avatar");
    expect(popup).toContain("Confirm and create vouchers");
    expect(popup).toContain("Print these vouchers");
    expect(popup).toContain("getVoucherPrintLayout");
    expect(popup).toContain("/api/chat");
  });

  it("grounds each consultation in a curated, read-only RouterOS handbook", () => {
    expect(magicDudeRosGuide("guests").requiredReads).toContain("/ip/hotspot");
    expect(magicDudeRosGuide("voucher").source).toContain("HotSpot");
    expect(magicDudeRosGuide("router").safeNextStep).toContain("www-ssl");
    expect(missingRouterReadMessage(["/interface/bridge", "/ip/route"])).toContain(
      "/interface/bridge, /ip/route",
    );
    expect(fn).toContain("magicDudeRosGuide");
  });
});
