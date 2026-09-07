import { describe, expect, it } from "vitest";
import { explainError, explainRouterOsStatus, toErrorMessage } from "@/lib/error-message";
import { friendlyDeviceError } from "@/lib/guards.server";
import { classifyCloudFailure } from "@/lib/router-test.server";

describe("toErrorMessage", () => {
  it("reads Error.message", () => {
    expect(toErrorMessage(new Error("Site quota exceeded"))).toBe("Site quota exceeded");
  });

  it("turns DEVICE_QUOTA into cause + fix (no P0001 code)", () => {
    const msg = toErrorMessage({
      message: "DEVICE_QUOTA_EXCEEDED: this account already uses 1 of 1 allowed sites.",
      code: "P0001",
    });
    expect(msg).toMatch(/Device limit reached/i);
    expect(msg).toMatch(/approve another device slot/i);
    expect(msg).not.toMatch(/P0001/);
    expect(msg).not.toContain("DEVICE_QUOTA_EXCEEDED");
  });

  it("never returns the useless [object Object] string", () => {
    expect(toErrorMessage({})).toBe("Something went wrong");
    expect(toErrorMessage({ message: "[object Object]" })).toBe("Something went wrong");
  });

  it("does not expose an empty serialized server error", () => {
    expect(toErrorMessage(new Error("{}"))).toBe("Something went wrong");
    expect(toErrorMessage({ message: {} })).toBe("Something went wrong");
  });

  it("reads the first Zod issue message", () => {
    expect(
      toErrorMessage({
        issues: [{ message: "Expected number, received string", path: ["latitude"] }],
      }),
    ).toBe("Expected number, received string");
  });

  it("explains RouterOS API 400 without dumping JSON digits", () => {
    const msg = toErrorMessage(
      'RouterOS API 400: {"detail":"no such command","error":400,"message":"Bad Request"}',
    );
    expect(msg).toMatch(/rejected a command|too old/i);
    expect(msg).not.toMatch(/RouterOS API 400/);
    expect(msg).not.toMatch(/"error":400/);
  });

  it("explains nginx HTML 404 as Hub proxy fix (no status digit lead)", () => {
    const msg = toErrorMessage(
      "RouterOS API 404: <html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1><hr><center>nginx/1.24.0</center>",
    );
    expect(msg).toMatch(/Magic Hub could not reach/i);
    expect(msg).toMatch(/rest-api|Show paste window|handshake/i);
    expect(msg).not.toMatch(/^RouterOS API 404/);
    expect(msg).not.toMatch(/<!doctype|<html/i);
  });

  it("explains Hub returned 502 without leading digits", () => {
    const msg = toErrorMessage("Hub returned 502: bad gateway");
    expect(msg).toMatch(/Magic Hub is not answering/i);
    expect(msg).not.toMatch(/Hub returned 502/);
  });

  it("explains DNS status codes without the digit", () => {
    const msg = toErrorMessage(
      "DNS lookup failed for cafe.sn.mynetname.net (status 3). Cloud DDNS may still be initializing.",
    );
    expect(msg).toMatch(/does not resolve/i);
    expect(msg).not.toMatch(/status 3/);
  });

  it("explains bare HTTP status for Terminal", () => {
    const msg = toErrorMessage("HTTP 401 — check path and credentials");
    expect(msg).toMatch(/username or password/i);
    expect(msg).not.toMatch(/^HTTP 401/);
  });
});

describe("explainRouterOsStatus", () => {
  it("maps 401 to password fix", () => {
    const msg = explainRouterOsStatus(401, "Unauthorized");
    expect(msg).toMatch(/username or password/i);
    expect(msg).toMatch(/rest-api|WinBox/i);
    expect(msg).not.toMatch(/\b401\b/);
  });

  it("maps 530 with host to DDNS guidance", () => {
    const msg = explainRouterOsStatus(530, "error code: 1016", { host: "bad.example" });
    expect(msg).toMatch(/bad\.example/);
    expect(msg).toMatch(/DDNS|Magic Hub|Local Connector/i);
  });
});

describe("friendlyDeviceError", () => {
  it("turns a PostgREST quota object into a readable site limit message", () => {
    const err = friendlyDeviceError(
      {
        message: "DEVICE_QUOTA_EXCEEDED: this account already uses 1 of 1 allowed sites.",
        code: "P0001",
      },
      "sites",
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/limit of site|Device limit reached|Plus/i);
    expect(err.message).not.toBe("[object Object]");
    expect(err.message).not.toMatch(/P0001/);
  });

  it("surfaces RLS as permission guidance instead of raw policy text", () => {
    const err = friendlyDeviceError(
      { message: 'new row violates row-level security policy for table "sites"' },
      "sites",
    );
    expect(err.message).toMatch(/permission/i);
    expect(err.message).not.toMatch(/row-level security policy/);
  });
});

describe("classifyCloudFailure stays aligned with humanized copy", () => {
  it("still classifies legacy RouterOS API strings", () => {
    expect(
      classifyCloudFailure(
        "RouterOS API 404: <html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>nginx/1.24.0 (Ubuntu)</center>",
      ),
    ).toBe("cloud_proxy_route");
    expect(classifyCloudFailure("RouterOS API 502: bad gateway")).toBe("cloud_proxy_route");
  });

  it("classifies humanized Hub/REST failures", () => {
    const human = explainError(
      "RouterOS API 404: <html><h1>404 Not Found</h1><center>nginx</center>",
    );
    const joined = human.fix ? `${human.cause}. ${human.fix}` : human.cause;
    expect(classifyCloudFailure(joined)).toBe("cloud_proxy_route");
    expect(
      classifyCloudFailure(
        "Router rejected the username or password. Open Routers → Edit and match WinBox login.",
      ),
    ).toBe("routeros_unauthorized");
  });
});

describe("unknown RouterOS responses remain actionable", () => {
  it("identifies an outbound RouterOS CA trust failure", () => {
    const message = explainRouterOsStatus(
      500,
      '{"detail":"failure: ssl: no trusted CA certificate found (6)"}',
    );
    expect(message).toContain("RouterOS could not verify the download certificate");
    expect(message).toContain("trusted CA store");
    expect(message).not.toContain("Magic Hub returned a server error");
  });

  it("preserves the router detail instead of returning a generic connectivity guess", () => {
    const message = explainRouterOsStatus(405, '{"detail":"file add is not allowed"}');
    expect(message).toContain("RouterOS rejected this request");
    expect(message).toContain("file add is not allowed");
    expect(message).not.toContain("Could not talk to the router");
  });

  it("distinguishes upstream server failures", () => {
    const message = explainRouterOsStatus(500, '{"detail":"proxy request failed"}');
    expect(message).toContain("server error");
    expect(message).toContain("proxy request failed");
  });
});
