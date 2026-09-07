import { describe, it, expect } from "vitest";
import {
  buildCloudRouterScript,
  buildCloudRollbackScript,
  parseHubEndpoint,
  hubEndpointForScript,
  type CloudPeer,
} from "@/lib/cloud-vps.server";
import { generateWireguardKeys } from "@/lib/wireguard/keys.server";

const peer: CloudPeer = {
  peerId: "peer_test",
  address: "10.77.0.5/32",
  publicKey: "TEST_ROUTER_PUBLIC_KEY",
  privateKey: "TEST_PRIVATE_KEY",
  serverPublicKey: "TEST_HUB_PUBLIC_KEY",
  endpoint: "hub.mikromagic.app:51820",
  allowedIps: "10.77.0.1/32",
};

function scriptFor(over: Partial<CloudPeer> = {}, restPort = 443, env?: NodeJS.ProcessEnv) {
  return buildCloudRouterScript({
    routerName: "site-a",
    peer: { ...peer, ...over },
    restPort,
    env,
  });
}

describe("parseHubEndpoint", () => {
  it("reads hostname:port", () => {
    expect(parseHubEndpoint("hub.mikromagic.app:51820")).toEqual({
      host: "hub.mikromagic.app",
      port: "51820",
    });
  });

  it("reads IPv4:port", () => {
    expect(parseHubEndpoint("47.237.197.22:51820")).toEqual({
      host: "47.237.197.22",
      port: "51820",
    });
  });

  it("defaults port 51820 when omitted", () => {
    expect(parseHubEndpoint("hub.mikromagic.app")).toEqual({
      host: "hub.mikromagic.app",
      port: "51820",
    });
  });

  it("strips a scheme if the hub sent a URL", () => {
    expect(parseHubEndpoint("https://hub.mikromagic.app:51820/internal")).toEqual({
      host: "hub.mikromagic.app",
      port: "51820",
    });
    expect(parseHubEndpoint("udp://47.237.197.22:51820")).toEqual({
      host: "47.237.197.22",
      port: "51820",
    });
  });
});

describe("hubEndpointForScript", () => {
  it("maps hub.mikromagic.app to the production IP so broken LAN DNS cannot poison the peer", () => {
    expect(hubEndpointForScript("hub.mikromagic.app:51820", {})).toEqual({
      host: "47.237.197.22",
      port: "51820",
      displayHost: "hub.mikromagic.app",
    });
  });

  it("prefers VPS_ROUTER_HUB_PUBLIC_IP when set", () => {
    expect(
      hubEndpointForScript("hub.mikromagic.app:51820", {
        VPS_ROUTER_HUB_PUBLIC_IP: "203.0.113.9",
      }),
    ).toEqual({
      host: "203.0.113.9",
      port: "51820",
      displayHost: "hub.mikromagic.app",
    });
  });

  it("keeps an IPv4 endpoint unchanged", () => {
    expect(hubEndpointForScript("198.51.100.7:51820", {})).toEqual({
      host: "198.51.100.7",
      port: "51820",
      displayHost: "198.51.100.7",
    });
  });
});

describe("buildCloudRouterScript", () => {
  it("sets tunnel /24, MTU 1280, and MSS clamp even when peer address is /32", () => {
    const script = scriptFor();
    expect(script).toContain(
      'add name=magic-cloud listen-port=13231 mtu=1280 private-key="TEST_PRIVATE_KEY"',
    );
    expect(script).toContain("add address=10.77.0.5/24 interface=magic-cloud");
    expect(script).not.toContain("add address=10.77.0.5/32");
    expect(script).toContain("action=change-mss new-mss=1160");
    expect(script).toContain("Tunnel 10.77.0.5/24");
  });

  it("points the peer at the hub IP (not a DNS-poisonable hostname) and the hub public key", () => {
    const script = scriptFor();
    expect(script).toContain('endpoint-address="47.237.197.22"');
    expect(script).toContain("endpoint-port=51820");
    expect(script).toContain('public-key="TEST_HUB_PUBLIC_KEY"');
    expect(script).toContain("allowed-address=10.77.0.1/32");
    expect(script).toContain("persistent-keepalive=25s");
    expect(script).not.toContain("TEST_ROUTER_PUBLIC_KEY");
    expect(script).not.toContain('endpoint-address="hub.mikromagic.app"');
    expect(script).not.toContain("endpoint-address=10.77");
  });

  it("heals REST in the same paste (cert, www-ssl, rest-api, reverse-proxy off)", () => {
    const script = scriptFor();
    expect(script).toContain('name="magic-https"');
    expect(script).toContain("www-ssl");
    expect(script).toContain("rest-api");
    expect(script).toContain("reverse-proxy");
    expect(script).toContain("Ignore hub/10.77.0.1 ping");
  });

  it("keeps the full group policy valid for Magic Hub REST reads", () => {
    const script = scriptFor();
    expect(script).toContain('/user/group set [find name="full"]');
    expect(script).toContain("read,write");
    expect(script).toContain("rest-api");
    expect(script).toContain("sniff");
    expect(script).not.toContain("sniffer");
  });

  it("gates install on WAN preflight (route, duplicate IP, ping from the board)", () => {
    const script = scriptFor();
    expect(script).toContain("Magic Hub preflight (WAN)");
    expect(script).toContain("STOP: no default route");
    expect(script).toContain("STOP: same IP on more than one interface");
    expect(script).toContain("ping 8.8.8.8");
    expect(script).toContain("not your Mac/PC");
    expect(script).toContain("Magic Hub NOT installed");
    expect(script).toContain("add name=magic-cloud");
    // Tunnel bits only inside the else branch after preflight
    const stopAt = script.indexOf("Magic Hub NOT installed");
    const addAt = script.indexOf("add name=magic-cloud");
    expect(stopAt).toBeGreaterThan(-1);
    expect(addAt).toBeGreaterThan(stopAt);
  });

  it("bounces the tunnel and prints handshake status so users do not chase ICMP", () => {
    const script = scriptFor();
    expect(script).toContain('/interface/wireguard disable [find name="magic-cloud"]');
    expect(script).toContain('/interface/wireguard enable [find name="magic-cloud"]');
    expect(script).toContain("/interface/wireguard/peers print detail");
  });

  it("is safe to paste twice (removes magic-cloud first)", () => {
    const script = scriptFor();
    const removeAt = script.indexOf('/interface/wireguard remove [find name="magic-cloud"]');
    const addAt = script.indexOf("add name=magic-cloud");
    expect(removeAt).toBeGreaterThan(-1);
    expect(addAt).toBeGreaterThan(removeAt);
  });

  it("uses a real WireGuard keypair in RouterOS form", () => {
    const keys = generateWireguardKeys();
    expect(Buffer.from(keys.privateKey, "base64")).toHaveLength(32);
    expect(Buffer.from(keys.publicKey, "base64")).toHaveLength(32);
    const script = scriptFor({
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      serverPublicKey: "HUB_PUB",
    });
    expect(script).toContain(`private-key="${keys.privateKey}"`);
    expect(script).not.toContain(`public-key="${keys.publicKey}"`);
    expect(script).toContain('public-key="HUB_PUB"');
  });

  it("rejects a missing hub endpoint or keys", () => {
    expect(() => scriptFor({ endpoint: "" })).toThrow(/endpoint/i);
    expect(() => scriptFor({ privateKey: "" })).toThrow(/private key/i);
    expect(() => scriptFor({ serverPublicKey: "  " })).toThrow(/public key/i);
    expect(() => scriptFor({ address: "not-an-ip" })).toThrow(/tunnel address/i);
  });
});

describe("buildCloudRollbackScript", () => {
  it("removes mangle rules as well as filter and interface", () => {
    const script = buildCloudRollbackScript();
    expect(script).toContain('/ip/firewall/mangle remove [find comment~"magic-cloud"]');
    expect(script).toContain('/interface/wireguard remove [find name="magic-cloud"]');
  });
});
