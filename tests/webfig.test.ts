import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import {
  buildWebfigLauncher,
  directWebfigUrl,
  hostForWebfigUrl,
  hubWebfigLaunchUrl,
} from "@/lib/webfig";
import { WEBFIG_LOCKED_REASON, canLaunchWebfig } from "@/lib/webfig-access";
import { hubWebfigNginxSnippet } from "@/lib/hub-webfig-nginx";
import { cloudRestBase, cloudWebfigLaunchUrl } from "@/lib/cloud-vps.server";
import { webfigLaunchersForRows } from "@/lib/webfig.server";
import { signWebfigToken, webfigTokenCanonical } from "@/lib/webfig-auth.server";

const PEER = "peer_4db74fe0-28e6-40cf-883d-532c3daccbfe";
const ROUTER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DDNS = "ccr2004.sn.mynetname.net";

const base = {
  id: ROUTER,
  host: DDNS,
  port: 443,
  username: "admin",
  use_tls: true,
};

describe("hostForWebfigUrl", () => {
  it("leaves hostnames and IPv4 alone", () => {
    expect(hostForWebfigUrl(DDNS)).toBe(DDNS);
    expect(hostForWebfigUrl("192.168.88.1")).toBe("192.168.88.1");
  });
  it("brackets IPv6 literals", () => {
    expect(hostForWebfigUrl("2001:db8::1")).toBe("[2001:db8::1]");
    expect(hostForWebfigUrl("[2001:db8::1]")).toBe("[2001:db8::1]");
  });
});

describe("directWebfigUrl", () => {
  it("omits default https/http ports", () => {
    expect(directWebfigUrl({ host: DDNS, port: 443, useTls: true })).toBe(
      `https://${DDNS}/webfig/`,
    );
    expect(directWebfigUrl({ host: "192.168.88.1", port: 80, useTls: false })).toBe(
      "http://192.168.88.1/webfig/",
    );
  });
  it("keeps non-default REST/www-ssl ports", () => {
    expect(directWebfigUrl({ host: DDNS, port: 8443, useTls: true })).toBe(
      `https://${DDNS}:8443/webfig/`,
    );
  });
});

describe("buildWebfigLauncher", () => {
  it("hides WebFig on the sandbox router", () => {
    expect(buildWebfigLauncher({ ...base, connection_mode: "sandbox" }, {})).toBeNull();
  });

  it("does not send Magic Hub routers to the public DDNS name", () => {
    const got = buildWebfigLauncher(
      { ...base, connection_mode: "hub", cloud_peer_id: PEER },
      { hubOrigin: "https://hub.mikromagic.app/internal/provisioner" },
    );
    expect(got?.via).toBe("hub");
    expect(got?.url).toBe(`https://hub.mikromagic.app/peers/${PEER}/open-webfig`);
    expect(got?.url).not.toContain(DDNS);
    expect(got?.url).not.toMatch(/10\.77\./);
  });

  it("strips a trailing slash on the hub origin", () => {
    const got = buildWebfigLauncher(
      { ...base, connection_mode: "hub", cloud_peer_id: PEER },
      { hubOrigin: "https://hub.example/" },
    );
    expect(got?.url).toBe(`https://hub.example/peers/${PEER}/open-webfig`);
  });

  it("refuses a hub row when the hub origin is missing", () => {
    const got = buildWebfigLauncher(
      { ...base, connection_mode: "hub", cloud_peer_id: PEER },
      { hubOrigin: null },
    );
    expect(got?.via).toBe("unavailable");
    expect(got?.url).toBeNull();
    expect(got?.reason).toMatch(/VPS_ROUTER_API_URL/i);
  });

  it("does not send Magic Hub routers to a public CGNAT hostname before a peer exists", () => {
    const got = buildWebfigLauncher(
      { ...base, connection_mode: "hub" },
      { hubOrigin: "https://hub.example" },
    );
    expect(got?.via).toBe("unavailable");
    expect(got?.url).toBeNull();
    expect(got?.reason).toMatch(/Connect via Hub first/i);
  });

  it("treats legacy connection_mode cloud as Magic Hub", () => {
    const got = buildWebfigLauncher(
      { ...base, connection_mode: "cloud", cloud_peer_id: PEER },
      { hubOrigin: "https://hub.example" },
    );
    expect(got?.via).toBe("hub");
    expect(got?.url).not.toContain(DDNS);
  });

  it("keeps Local Connector WebFig on the LAN address", () => {
    const got = buildWebfigLauncher(
      { ...base, host: "192.168.10.1", connector_id: "c1", connection_mode: "direct" },
      {},
    );
    expect(got?.via).toBe("connector");
    expect(got?.url).toBe("https://192.168.10.1/webfig/");
    expect(got?.reason).toMatch(/LAN/i);
  });

  it("keeps Cloud Remote (public DDNS) on the stored host", () => {
    const got = buildWebfigLauncher({ ...base, connection_mode: "direct" }, {});
    expect(got?.via).toBe("direct");
    expect(got?.url).toBe(`https://${DDNS}/webfig/`);
  });
});

describe("WebFig product access", () => {
  it("keeps WebFig for Primary, Developer, and MikroMagic Agent accounts", () => {
    expect(canLaunchWebfig(["primary"])).toBe(true);
    expect(canLaunchWebfig([], true)).toBe(true);
    expect(canLaunchWebfig(["agent"])).toBe(true);
  });

  it("locks WebFig for User, Trial, and Expired accounts", () => {
    expect(canLaunchWebfig(["client"])).toBe(false);
    expect(canLaunchWebfig(["client", "trial"])).toBe(false);
    expect(canLaunchWebfig(["expired"])).toBe(false);
    expect(WEBFIG_LOCKED_REASON).toMatch(/^LOCKED/);
  });

  it("does not send a WebFig URL to a locked account", async () => {
    const launchers = await webfigLaunchersForRows({} as never, [base], { locked: true });
    expect(launchers.get(ROUTER)).toMatchObject({
      url: null,
      locked: true,
      reason: WEBFIG_LOCKED_REASON,
    });
  });
});

describe("hub URL helpers", () => {
  it("encodes the peer id in the launch path", () => {
    expect(hubWebfigLaunchUrl("https://hub.example", "a/b")).toBe(
      "https://hub.example/peers/a%2Fb/open-webfig",
    );
  });

  it("adds an authenticated launch capability only when provided", () => {
    expect(
      hubWebfigLaunchUrl("https://hub.example", "peer_1", {
        expires: "123",
        signature: "signed-value",
      }),
    ).toBe("https://hub.example/peers/peer_1/open-webfig?expires=123&signature=signed-value");
  });

  it("uses the same peer-bound HMAC contract as the Hub", async () => {
    const secret = "a".repeat(64);
    const peerId = "peer_4db74fe0-28e6-40cf-883d-532c3daccbfe";
    const expiresAt = "1000060000";
    const signature = signWebfigToken(secret, "webfig:launch", peerId, expiresAt);
    const hub = await import("../deploy/mikromagic-hub/service.mjs");
    expect(webfigTokenCanonical("webfig:launch", peerId, expiresAt)).toBe(
      hub.webfigTokenCanonical("webfig:launch", peerId, expiresAt),
    );
    expect(
      hub.verifyWebfigToken({
        secret,
        scope: "webfig:launch",
        peerId,
        expiresAt,
        signature,
        now: 1_000_000_000,
        maxFutureMs: 120_000,
      }),
    ).toBe(true);
    expect(
      hub.verifyWebfigToken({
        secret,
        scope: "webfig:launch",
        peerId,
        expiresAt,
        signature,
        now: 1_000_060_000,
        maxFutureMs: 120_000,
      }),
    ).toBe(false);
  });
});

describe("hub nginx snippet", () => {
  it("bounces open-webfig to /webfig/ with a peer cookie", () => {
    const conf = hubWebfigNginxSnippet();
    expect(conf).toContain("open-webfig");
    expect(conf).toContain("auth_request /_mm_webfig_launch_auth");
    expect(conf).toContain("auth_request /_mm_webfig_session_auth");
    expect(conf).toContain("X-MM-WebFig-URI $request_uri");
    expect(conf).toContain("Set-Cookie");
    expect(conf).toContain("mm_webfig_signature");
    expect(conf).toContain("mm_webfig_peer");
    expect(conf).toContain("location /webfig/");
    expect(conf).toContain("location = /jsproxy");
    expect(conf).toContain("proxy_ssl_verify off");
  });

  it("stays in sync with docs/hub-webfig-nginx.conf", () => {
    const onDisk = readFileSync("docs/hub-webfig-nginx.conf", "utf8");
    expect(onDisk).toBe(hubWebfigNginxSnippet());
  });
});

describe("cloud data-plane URLs", () => {
  const keys = [
    "VPS_ROUTER_API_URL",
    "VPS_ROUTER_API_SIGNING_SECRET",
    "VPS_ROUTER_API_KEY_ID",
  ] as const;
  afterEach(() => {
    for (const k of keys) delete process.env[k];
  });

  it("keeps REST and WebFig on the public hub origin, not the provisioner path", () => {
    process.env["VPS_ROUTER_API_URL"] = "https://hub.mikromagic.app/internal/provisioner";
    process.env["VPS_ROUTER_API_SIGNING_SECRET"] = "secret";
    process.env["VPS_ROUTER_API_KEY_ID"] = "v1";
    expect(cloudRestBase(PEER)).toBe(`https://hub.mikromagic.app/peers/${PEER}/rest`);
    expect(cloudWebfigLaunchUrl(PEER)).toBe(`https://hub.mikromagic.app/peers/${PEER}/open-webfig`);
  });
});

describe("UI wiring", () => {
  it("no longer builds WebFig from the public host on the Routers page", () => {
    const src = readFileSync("src/routes/_authenticated/app.routers.tsx", "utf8");
    expect(src).toContain("WebfigButton");
    expect(src).not.toMatch(/r\.host.*\/webfig\//);
    expect(src).not.toMatch(/webfigUrl/);
  });

  it("renders a themed LOCKED state without a usable launcher URL", () => {
    const src = readFileSync("src/components/WebfigButton.tsx", "utf8");
    expect(src).toContain("launcher.locked");
    expect(src).toContain("LOCKED");
    expect(src).toContain("LockKeyhole");
  });
});
