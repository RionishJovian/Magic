import { describe, expect, it } from "vitest";
import {
  assertSafeEndpoint,
  assertHubHostLabel,
  classifyHost,
  classifyHubHostLabel,
  parseIpv6,
  unsafeIpv4Reason,
  unsafeIpv6Reason,
  validatePort,
  EndpointError,
} from "@/lib/net/endpoint.server";

// Deterministic and network-free: hostnames are only classified, never resolved
// (assertSafeEndpoint is called with resolve: false).

const ok = (host: string) => {
  const r = classifyHost(host);
  expect(r, `${host} should be accepted`).not.toHaveProperty("error");
  return r as { kind: string; host: string };
};
const rejected = (host: string) => {
  const r = classifyHost(host);
  expect(r, `${host} should be rejected`).toHaveProperty("error");
  return (r as { error: string }).error;
};

describe("endpoint validator — accepted", () => {
  it("accepts public IPv4 literals", () => {
    expect(ok("8.8.8.8").kind).toBe("ipv4");
    expect(ok("203.0.114.5").kind).toBe("ipv4");
  });

  it("accepts public hostnames and lower-cases them", () => {
    expect(ok("router.example.com")).toEqual({ kind: "hostname", host: "router.example.com" });
    expect(ok("Shop-1.DDNS.example.net").host).toBe("shop-1.ddns.example.net");
  });

  it("accepts a public IPv6 literal", () => {
    expect(ok("2400:cb00:2049:1::a29f:1804").kind).toBe("ipv6");
  });

  it("accepts valid ports and rejects the rest", () => {
    expect(validatePort(8728)).toEqual({ port: 8728 });
    expect(validatePort(0)).toHaveProperty("error");
    expect(validatePort(65536)).toHaveProperty("error");
    expect(validatePort("443")).toHaveProperty("error");
    expect(validatePort(443.5)).toHaveProperty("error");
  });
});

describe("endpoint validator — rejected shapes", () => {
  it("rejects URLs, paths, userinfo and query strings", () => {
    expect(rejected("https://router.example.com")).toMatch(/no https:\/\//i);
    expect(rejected("router.example.com/rest")).toMatch(/no path/i);
    expect(rejected("admin@router.example.com")).toMatch(/username/i);
    expect(rejected("router.example.com?x=1")).toMatch(/query/i);
  });

  it("rejects an embedded port", () => {
    expect(rejected("router.example.com:8728")).toMatch(/without a port/i);
    expect(rejected("8.8.8.8:443")).toMatch(/without a port/i);
  });

  it("rejects bracketed IPv6 and zone ids", () => {
    expect(rejected("[2400:cb00::1]")).toMatch(/brackets/i);
    expect(rejected("fe80::1%eth0")).toMatch(/brackets|zone/i);
  });

  it("rejects local names and bare labels", () => {
    expect(rejected("localhost")).toMatch(/local network name/i);
    expect(rejected("router.local")).toMatch(/local network name/i);
    expect(rejected("gateway")).toMatch(/full hostname/i);
    expect(rejected("")).toMatch(/Enter the router address/i);
  });
});

describe("endpoint validator — rejected IPv4 ranges", () => {
  const cases: Array<[string, RegExp]> = [
    ["127.0.0.1", /loopback/],
    ["10.0.0.1", /private/],
    ["172.16.5.4", /private/],
    ["192.168.88.1", /private/],
    ["100.64.0.1", /CGNAT/],
    ["169.254.10.1", /link-local/],
    ["192.0.2.10", /documentation/],
    ["198.51.100.10", /documentation/],
    ["203.0.113.10", /documentation/],
    ["198.18.0.1", /benchmarking/],
    ["224.0.0.1", /multicast/],
    ["240.0.0.1", /reserved/],
    ["0.0.0.0", /unspecified/],
  ];
  it.each(cases)("rejects %s", (host, pattern) => {
    expect(rejected(host)).toMatch(pattern);
    expect(unsafeIpv4Reason(host.split(".").map(Number))).toMatch(pattern);
  });
});

describe("endpoint validator — rejected IPv6 ranges", () => {
  const cases: Array<[string, RegExp]> = [
    ["::1", /loopback/],
    ["fe80::1", /link-local/],
    ["fd00::1234", /unique-local/],
    ["ff02::1", /multicast/],
    ["2001:db8::1", /documentation/],
    ["::", /unspecified/],
    ["::ffff:127.0.0.1", /IPv4-mapped .*loopback/],
    ["::ffff:192.168.1.1", /IPv4-mapped .*private/],
  ];
  it.each(cases)("rejects %s", (host, pattern) => {
    expect(rejected(host)).toMatch(pattern);
    expect(unsafeIpv6Reason(parseIpv6(host)!)).toMatch(pattern);
  });

  it("still allows an IPv4-mapped public address", () => {
    expect(unsafeIpv6Reason(parseIpv6("::ffff:8.8.8.8")!)).toBeNull();
  });
});

describe("assertSafeEndpoint (no DNS)", () => {
  it("returns the normalized endpoint for a public literal", async () => {
    await expect(assertSafeEndpoint("8.8.8.8", 443)).resolves.toEqual({
      host: "8.8.8.8",
      kind: "ipv4",
      port: 443,
      address: "8.8.8.8",
    });
  });

  it("skips resolution when asked, but still enforces shape and port", async () => {
    await expect(
      assertSafeEndpoint("router.example.com", 8729, { resolve: false }),
    ).resolves.toMatchObject({ host: "router.example.com", port: 8729, address: null });
    await expect(
      assertSafeEndpoint("router.example.com", 0, { resolve: false }),
    ).rejects.toBeInstanceOf(EndpointError);
    await expect(assertSafeEndpoint("192.168.0.1", 443, { resolve: false })).rejects.toThrow(
      /private/,
    );
  });
});

describe("Magic Hub host labels", () => {
  it("accepts CGNAT and private IPv4 as labels", () => {
    expect(classifyHubHostLabel("100.64.1.2")).toEqual({ kind: "ipv4", host: "100.64.1.2" });
    expect(classifyHubHostLabel("192.168.88.1")).toEqual({ kind: "ipv4", host: "192.168.88.1" });
    expect(assertHubHostLabel("100.64.1.2", 443)).toEqual({
      host: "100.64.1.2",
      kind: "ipv4",
      port: 443,
    });
  });

  it("accepts Cloud DDNS-style hostnames without DNS lookup", () => {
    expect(assertHubHostLabel("site-a.sn.mynetname.net", 443)).toEqual({
      host: "site-a.sn.mynetname.net",
      kind: "hostname",
      port: 443,
    });
  });

  it("accepts a single-label nickname that is never dialled", () => {
    expect(classifyHubHostLabel("kyaw-coffee")).toEqual({
      kind: "hostname",
      host: "kyaw-coffee",
    });
    expect(assertHubHostLabel("CCR-2004", 443).host).toBe("ccr-2004");
  });

  it("still rejects URL shapes", () => {
    expect(classifyHubHostLabel("https://site.example.com")).toHaveProperty("error");
    expect(() => assertHubHostLabel("site.example.com/rest", 443)).toThrow(EndpointError);
  });
});

describe("assertConnectorLanEndpoint", () => {
  it("accepts private LAN IPv4 for connector-bound routers", async () => {
    const { assertConnectorLanEndpoint } = await import("@/lib/connector-guard.server");
    expect(assertConnectorLanEndpoint("192.168.88.1", 443)).toEqual({
      host: "192.168.88.1",
      port: 443,
    });
    expect(assertConnectorLanEndpoint("10.0.0.1", 8729).host).toBe("10.0.0.1");
  });

  it("rejects public hosts and hostnames", async () => {
    const { assertConnectorLanEndpoint } = await import("@/lib/connector-guard.server");
    expect(() => assertConnectorLanEndpoint("8.8.8.8", 443)).toThrow(/private LAN IPv4/);
    expect(() => assertConnectorLanEndpoint("router.example.com", 443)).toThrow(/private LAN IPv4/);
  });
});
