import { beforeEach, describe, expect, it, vi } from "vitest";

const routerAPI = vi.hoisted(() => ({
  ping: vi.fn(),
  addFile: vi.fn(),
  readFile: vi.fn(),
  findFileId: vi.fn(),
  removeFile: vi.fn(),
  fetchToPath: vi.fn(),
  setProfileHtmlDir: vi.fn(),
}));

vi.mock("@/lib/mikrotik.server", () => ({ routerAPI }));

import {
  assertPortalTextCompatibility,
  executeDeploy,
  isRouterFetchTrustError,
  LEGACY_ROUTEROS_TEXT_LIMIT_BYTES,
  writeTextFile,
} from "@/lib/portal/deploy.server";
import { renderPortalTextBundle } from "@/lib/portal-template.server";
import type { RouterConn } from "@/lib/mikrotik.server";

const conn = {} as RouterConn;
const path = "hotspot-mm-v1/login.html";
const content = "<html>trusted portal</html>";
const signedUrl = "https://storage.example/signed-login";

describe("portal text compatibility writer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerAPI.ping.mockResolvedValue({ version: "7.6 (stable)" });
    routerAPI.findFileId.mockResolvedValue(null);
    routerAPI.removeFile.mockResolvedValue(undefined);
    routerAPI.fetchToPath.mockResolvedValue(undefined);
    routerAPI.readFile.mockResolvedValue(content);
  });

  it("uses the RouterOS file API when it can write and read back exact content", async () => {
    routerAPI.addFile.mockResolvedValue(undefined);

    await writeTextFile(conn, path, content, signedUrl);

    expect(routerAPI.addFile).toHaveBeenCalledWith(conn, path, content);
    expect(routerAPI.fetchToPath).not.toHaveBeenCalled();
    expect(routerAPI.readFile).toHaveBeenCalledWith(conn, path);
  });

  it("retries only a CA trust failure and verifies the exact downloaded text", async () => {
    routerAPI.addFile.mockRejectedValue(new Error("RouterOS rejected /file/add"));
    routerAPI.fetchToPath
      .mockRejectedValueOnce(new Error("failure: ssl: no trusted CA certificate found (6)"))
      .mockResolvedValueOnce(undefined);
    routerAPI.findFileId.mockResolvedValueOnce(null).mockResolvedValueOnce("*partial");

    await writeTextFile(conn, path, content, signedUrl);

    expect(routerAPI.fetchToPath).toHaveBeenNthCalledWith(1, conn, signedUrl, path);
    expect(routerAPI.fetchToPath).toHaveBeenNthCalledWith(2, conn, signedUrl, path, {
      checkCertificate: false,
    });
    expect(routerAPI.removeFile).toHaveBeenCalledWith(conn, "*partial");
    expect(routerAPI.readFile).toHaveBeenCalledWith(conn, path);
  });

  it("does not weaken certificate checking for unrelated fetch failures", async () => {
    routerAPI.addFile.mockRejectedValue(new Error("RouterOS rejected /file/add"));
    routerAPI.fetchToPath.mockRejectedValue(new Error("failure: timeout"));

    await expect(writeTextFile(conn, path, content, signedUrl)).rejects.toThrow(/timeout/i);
    expect(routerAPI.fetchToPath).toHaveBeenCalledTimes(1);
  });

  it("deletes a downloaded file whose contents do not match", async () => {
    routerAPI.addFile.mockRejectedValue(new Error("RouterOS rejected /file/add"));
    routerAPI.readFile.mockResolvedValue("<html>changed in transit</html>");
    routerAPI.findFileId.mockResolvedValueOnce(null).mockResolvedValueOnce("*bad");

    await expect(writeTextFile(conn, path, content, signedUrl)).rejects.toThrow(
      /integrity verification failed/i,
    );
    expect(routerAPI.removeFile).toHaveBeenCalledWith(conn, "*bad");
  });
});

describe("RouterOS fetch trust classification", () => {
  it("recognizes missing or untrusted CA chains", () => {
    expect(isRouterFetchTrustError("ssl: no trusted CA certificate found")).toBe(true);
    expect(isRouterFetchTrustError("unable to get issuer certificate locally")).toBe(true);
    expect(
      isRouterFetchTrustError(
        "RouterOS could not verify the download certificate. Update RouterOS certificate trust.",
      ),
    ).toBe(true);
  });

  it("does not classify timeouts or authorization failures as trust errors", () => {
    expect(isRouterFetchTrustError("fetch timeout")).toBe(false);
    expect(isRouterFetchTrustError("401 Unauthorized")).toBe(false);
  });
});

describe("legacy RouterOS portal text compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerAPI.ping.mockResolvedValue({ version: "7.6 (stable)" });
  });

  const voucherBundle = renderPortalTextBundle({
    businessName: "Welcome Wi-Fi",
    welcomeText: "Enter the voucher code from the front desk to get online.",
    terms: "By connecting you agree to our fair-use policy.",
    primaryHex: "#ffb547",
    glassTintHex: "#7ad0ff",
    guestMode: "voucher_only",
  });

  it("keeps the voucher portal bundle verifiable on RouterOS 7.6", () => {
    expect(voucherBundle.find((file) => file.name === "style.css")?.content).toContain(
      '@import url("style-extra.css")',
    );
    expect(voucherBundle.find((file) => file.name === "style-extra.css")?.content).toContain(
      ".guest-btn",
    );
    expect(
      voucherBundle.every(
        (file) => Buffer.byteLength(file.content, "utf8") <= LEGACY_ROUTEROS_TEXT_LIMIT_BYTES,
      ),
    ).toBe(true);
    expect(() => assertPortalTextCompatibility("7.6 (stable)", voucherBundle)).not.toThrow();
  });

  it("stops an oversized legacy-router deployment before any file write", () => {
    const oversized = [{ name: "oversized.html", content: "x".repeat(4_096) }];
    expect(() => assertPortalTextCompatibility("7.6 (stable)", oversized)).toThrow(
      /stopped before writing files.*oversized\.html.*4096 bytes/i,
    );
  });

  it("checks the legacy limit before staging or switching profiles", async () => {
    await expect(
      executeDeploy(conn, {
        version: "v1",
        files: [{ name: "oversized.html", content: "x".repeat(4_096) }],
        profiles: [{ id: "*1", name: "WELCOME", htmlDirectory: "hotspot" }],
      }),
    ).rejects.toThrow(/stopped before writing files/i);
    expect(routerAPI.addFile).not.toHaveBeenCalled();
    expect(routerAPI.fetchToPath).not.toHaveBeenCalled();
  });

  it("allows modern RouterOS releases to use their larger file-content support", () => {
    const oversized = [{ name: "modern.html", content: "x".repeat(60_000) }];
    expect(() => assertPortalTextCompatibility("7.16.1 (stable)", oversized)).not.toThrow();
  });

  it("uses the signed fetch fallback for the generated manifest on RouterOS 7.6", async () => {
    const manifestContent =
      '{"version":"v1","fingerprint":"0123456789abcdef","deployedAt":"2026-09-01T00:00:00.000Z"}';
    routerAPI.addFile.mockRejectedValue(new Error("RouterOS rejected /file/add"));
    routerAPI.readFile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(content)
      .mockResolvedValueOnce(manifestContent);
    routerAPI.findFileId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("*file")
      .mockResolvedValueOnce("*manifest");
    routerAPI.setProfileHtmlDir.mockResolvedValue(undefined);

    const result = await executeDeploy(conn, {
      version: "v1",
      files: [{ name: "login.html", content }],
      profiles: [{ id: "*1", name: "WELCOME", htmlDirectory: "hotspot" }],
      fingerprint: "0123456789abcdef",
      manifestContent,
      textFetchUrls: {
        "hotspot-mm-v1/login.html": "https://storage.example/signed-login",
        "hotspot-mm-v1/mm-manifest.json": "https://storage.example/signed-manifest",
      },
    });

    expect(result.result.ok).toBe(true);
    expect(routerAPI.fetchToPath).toHaveBeenCalledWith(
      conn,
      "https://storage.example/signed-manifest",
      "hotspot-mm-v1/mm-manifest.json",
    );
  });
});
