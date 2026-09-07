import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chooser = readFileSync("src/components/RemoteAccessChooser.tsx", "utf8");
const routers = readFileSync("src/routes/_authenticated/app.routers.tsx", "utf8");
const connectors = readFileSync("src/routes/_authenticated/app.connectors.tsx", "utf8");

describe("Magic Hub is a first-class remote path", () => {
  it("lists WireGuard hub beside Local Connector (and Public IP for staff) from the shared list", () => {
    expect(chooser).toMatch(/connectionMethodsForRole/);
    expect(chooser).toMatch(/isStaffRoles/);
    expect(chooser).toMatch(/MagicHubSparkles/);
    expect(chooser).toMatch(/magic-hub-method is-selected/);
    expect(chooser).toMatch(/privileged \? "sm:grid-cols-3" : "sm:grid-cols-2"/);
    const shared = readFileSync("src/lib/connection-methods.ts", "utf8");
    expect(shared).toMatch(/title: "Magic Hub"/);
    expect(shared).toMatch(/badge: "Cloud Remote"/);
    expect(shared).toMatch(/featured: true/);
    expect(shared).toMatch(/Local Connector/);
    expect(shared).toMatch(/Public IP \/ DDNS/);
    expect(shared).toMatch(/staffOnly: true/);
    expect(shared).toMatch(/method: "hub"/);
    expect(shared).not.toMatch(/Cloud Remote \(DDNS \+ TLS\)/);
    expect(shared).not.toMatch(/Not Cloud Remote/);
  });

  it("exposes WireGuard as a connection-method card on Routers", () => {
    expect(routers).toMatch(/ConnMethod/);
    expect(routers).toMatch(/"hub"/);
    expect(routers).toMatch(/Magic Hub/);
    expect(routers).toMatch(/methodOptions/);
    expect(routers).toMatch(/sm:grid-cols-3/);
    expect(routers).not.toContain("RemoteAccessChooser");
  });

  it("keeps CloudPanel on Magic Hub cards and does not embed the removed TunnelPanel", () => {
    expect(routers).toMatch(/Magic Hub stays visible/);
    expect(routers).toContain("<CloudPanel");
    expect(routers).toContain("isHubMode");
    expect(routers).toContain("hubArtifacts");
    expect(routers).toContain("initialArtifacts");
    expect(routers).not.toContain("<TunnelPanel");
    expect(routers).toContain("<MultiWanPanel");
    expect(routers).not.toMatch(/open Details and press Connect via Hub/);
    expect(routers).not.toMatch(/site-a\.sn\.mynetname\.net/);
    expect(routers).toMatch(/search\.method \?\? "hub"/);
  });

  it("shows the nav chooser on Connectors (not on Routers — form owns the pick there)", () => {
    expect(connectors).toMatch(/<RemoteAccessChooser/);
    expect(routers).not.toMatch(/<RemoteAccessChooser/);
  });

  it("uses the Cloud DDNS example as the empty Magic Hub host placeholder", () => {
    expect(routers).not.toMatch(/kyaw-coffee/);
    expect(routers).toContain("#username@example53.sn.mynetname.net");
  });
});
