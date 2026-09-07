import { afterEach, describe, expect, it, vi } from "vitest";
import { routerAPI, type RouterConn } from "@/lib/mikrotik.server";

const conn: RouterConn = {
  host: "router-label",
  port: 443,
  username: "api-user",
  password: "test-password",
  useTls: true,
  // This exception belongs to app-to-router TLS and must not control the
  // router's independent outbound download verification.
  allowInsecureTls: true,
  baseUrlOverride: "https://hub.example/peers/p1/rest",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function successfulFetch() {
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("RouterOS outbound fetch certificate policy", () => {
  it("keeps certificate verification enabled by default", async () => {
    const fetchMock = successfulFetch();

    await routerAPI.fetchToPath(conn, "https://storage.example/file", "hotspot/file.html");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))["check-certificate"]).toBe("yes");
  });

  it("disables verification only when the caller explicitly requests it", async () => {
    const fetchMock = successfulFetch();

    await routerAPI.fetchToPath(conn, "https://storage.example/file", "hotspot/file.html", {
      checkCertificate: false,
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))["check-certificate"]).toBe("no");
  });
});
