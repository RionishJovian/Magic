import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/CloudPanel.tsx", "utf8");
const panelHelpers = readFileSync("src/components/cloud-panel.helpers.ts", "utf8");
const pasteDialog = readFileSync("src/components/MagicHubPasteDialog.tsx", "utf8");
const chooser = readFileSync("src/components/RemoteAccessChooser.tsx", "utf8");
const routers = readFileSync("src/routes/_authenticated/app.routers.tsx", "utf8");
const cloudFns = readFileSync("src/lib/cloud-router.functions.ts", "utf8");
const saveFns = readFileSync("src/lib/routers.functions.ts", "utf8");

describe("Magic Hub paste-script window", () => {
  it("opens a shared dialog for the one-time script", () => {
    expect(pasteDialog).toContain("Paste this on the router");
    expect(pasteDialog).toContain('data-testid="magic-hub-paste-dialog"');
    expect(panel).toContain("MagicHubPasteDialog");
    expect(panel).toContain("magicHubScriptStorageKey");
    expect(panel).toContain("Show paste window");
  });

  it("does not auto-open the paste dialog when restoring script from sessionStorage", () => {
    const storedBlock = panel.match(
      /const stored = readStoredArtifacts\(routerId\);[\s\S]*?\n\s*}\s*\n\s*}, \[initialArtifacts, routerId\]/,
    );
    expect(storedBlock?.[0]).toBeTruthy();
    expect(storedBlock![0]).not.toContain("setScriptOpen(true)");
  });

  it("auto-opens via page-level dialog after Add router or Connect via Hub", () => {
    expect(routers).toContain("pagePaste");
    expect(routers).toContain("setPagePaste");
    expect(routers).toContain("MagicHubPasteDialog");
    expect(routers).toContain("onPasteScript");
    expect(panel).toMatch(/onPasteRef\.current/);
    expect(panel).toMatch(/reissueScript:\s*true/);
  });

  it("keeps the private key in sessionStorage only (not localStorage)", () => {
    expect(panelHelpers).toContain("`mm.magic-hub.script.${routerId}`");
    expect(panel).toContain("sessionStorage.setItem");
    expect(panel).not.toContain("localStorage.setItem");
  });

  it("shows a linear paste checklist so operators do not hop Scripts pages", () => {
    expect(pasteDialog).toContain("Stay here — do not hop to the Scripts page");
    expect(pasteDialog).toContain("From WinBox on this board (not your Mac/PC)");
    expect(pasteDialog).toContain("If you see STOP, fix WAN");
    expect(pasteDialog).toContain("Ignore ping timeouts to the hub");
    expect(pasteDialog).toContain("Check now → Test");
  });

  it("does not call Magic Hub a cloud tunnel in the remove dialog", () => {
    expect(panel).toContain("Remove Magic Hub for {name}?");
    expect(panel).not.toMatch(/cloud tunnel/i);
  });

  it("hides Connect via Hub until hub state has loaded", () => {
    expect(panel).toContain("state.isSuccess && s?.configured");
    expect(panel).toContain("state.isSuccess && !s?.configured");
  });

  it("saveRouter update provisions Magic Hub when the board has no peer yet", () => {
    expect(saveFns).toMatch(
      /connectionMethod === "hub"[\s\S]*cloud_peer_id[\s\S]*runProvisionHubPeer/,
    );
  });

  it("does not false-toast missing paste script on router edit", () => {
    expect(routers).toMatch(/method === "hub" && !vars\.id && newId && !hub\?\.routerScript/);
  });
});

describe("Magic Hub provision always returns paste when possible", () => {
  it("saveRouter dedupe still provisions Magic Hub", () => {
    expect(saveFns).toMatch(/deduped[\s\S]*connectionMethod === "hub"[\s\S]*runProvisionHubPeer/);
    expect(saveFns).toContain("reissueScript: true");
  });

  it("Connect via Hub can reissue a paste script and fails closed without VPS secrets", () => {
    expect(cloudFns).toContain("reissueScript");
    expect(cloudFns).toContain("isVpsConfigured");
    expect(cloudFns).toContain("VPS_ROUTER_*");
    expect(cloudFns).toContain("cloud_wg_private_key_ciphertext");
  });

  it("checks required RouterOS reads after a live hub handshake", () => {
    expect(cloudFns).toContain("MAGIC_HUB_REQUIRED_READ_PATHS");
    expect(cloudFns).toContain("verifyMagicHubRequiredReads");
    expect(cloudFns).toContain('status = "incomplete"');
    expect(panel).toContain("Magic Hub setup is incomplete");
  });
});

describe("Magic Hub is Cloud Remote", () => {
  it("labels Magic Hub as Cloud Remote and leads to a paste window", () => {
    const shared = readFileSync("src/lib/connection-methods.ts", "utf8");
    expect(shared).toMatch(/badge: "Cloud Remote"/);
    expect(shared).toMatch(/Cloud Remote for Starlink/);
    expect(shared).toMatch(/paste-script window/);
    expect(chooser).toContain("connectionMethodsForRole");
  });

  it("tells Add router that Magic Hub is Cloud Remote and not the Scripts page", () => {
    expect(routers).toMatch(/Magic Hub is Cloud Remote/);
    expect(routers).toMatch(/not on the Scripts page/);
    expect(routers).toMatch(/paste window opened/);
    expect(routers).toMatch(/Public IP \/ DDNS/);
  });
});
