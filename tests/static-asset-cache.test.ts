import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  STATIC_ASSET_CACHE_CONTROL,
  isFingerprintedAssetPath,
  withStaticAssetCacheControl,
} from "@/lib/static-asset-cache";

describe("static asset Cache-Control", () => {
  it("recognises fingerprinted Vite asset paths only", () => {
    expect(isFingerprintedAssetPath("/assets/index-AbCdEf12.js")).toBe(true);
    expect(isFingerprintedAssetPath("/assets/styles-9f3a2c1b.css")).toBe(true);
    expect(isFingerprintedAssetPath("/assets/font-abc.woff2")).toBe(true);
    expect(isFingerprintedAssetPath("/favicon.png")).toBe(false);
    expect(isFingerprintedAssetPath("/manifest.webmanifest")).toBe(false);
    expect(isFingerprintedAssetPath("/sw.js")).toBe(false);
    expect(isFingerprintedAssetPath("/app")).toBe(false);
    expect(isFingerprintedAssetPath("/api/public/checkout")).toBe(false);
    expect(isFingerprintedAssetPath("/assets/")).toBe(false);
    expect(isFingerprintedAssetPath("/assets/index.html")).toBe(false);
  });

  it("sets max-age=31536000 immutable on successful asset responses", () => {
    const req = new Request("https://example.com/assets/chunk-deadbeef.js");
    const res = withStaticAssetCacheControl(
      req,
      new Response("ok", { status: 200, headers: { "content-type": "text/javascript" } }),
    );
    expect(res.headers.get("cache-control")).toBe(STATIC_ASSET_CACHE_CONTROL);
    expect(STATIC_ASSET_CACHE_CONTROL).toContain("max-age=31536000");
  });

  it("does not override an existing Cache-Control header", () => {
    const req = new Request("https://example.com/assets/chunk-deadbeef.js");
    const res = withStaticAssetCacheControl(
      req,
      new Response("ok", {
        status: 200,
        headers: { "cache-control": "no-store" },
      }),
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("leaves HTML and API responses alone", () => {
    const html = withStaticAssetCacheControl(
      new Request("https://example.com/app"),
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    expect(html.headers.get("cache-control")).toBeNull();

    const api = withStaticAssetCacheControl(
      new Request("https://example.com/api/public/checkout/status"),
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      }),
    );
    expect(api.headers.get("cache-control")).toBe("no-store");
  });

  it("ships a Cloudflare _headers rule for /assets/* plus isolation headers", () => {
    const headers = readFileSync("public/_headers", "utf8");
    expect(headers).toMatch(/\/assets\/\*/);
    expect(headers).toMatch(/Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/i);
    expect(headers).toMatch(/\/sw\.js[\s\S]*Cache-Control:\s*no-cache/);
    expect(headers).toMatch(/X-Content-Type-Options:\s*nosniff/i);
    expect(headers).toMatch(/X-Frame-Options:\s*SAMEORIGIN/i);
    expect(headers).toMatch(/Referrer-Policy:\s*strict-origin-when-cross-origin/i);
    expect(headers).toMatch(/X-Robots-Tag:\s*noai,\s*noimageai/i);
  });
});
