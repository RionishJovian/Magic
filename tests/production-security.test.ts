import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cssUrl, escapeHtml, safeCssHex } from "@/lib/html-escape";
import { filterByUserIdSet } from "@/lib/admin-scope.server";
import { renderPortalFiles } from "@/lib/portal-template.server";
import { htmlRobotsTagFor, securityHeadersFor, withSecurityHeaders } from "@/lib/security-headers";

describe("HTML / CSS injection guards", () => {
  it("escapes markup used in print windows and portal HTML", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });

  it("accepts only #RRGGBB for generated CSS colours", () => {
    expect(safeCssHex("#ffb547", "#000000")).toBe("#ffb547");
    expect(safeCssHex("#fff;}</style><script>alert(1)</script>", "#7ad0ff")).toBe("#7ad0ff");
    expect(safeCssHex("red", "#7ad0ff")).toBe("#7ad0ff");
    expect(safeCssHex(null, "#112233")).toBe("#112233");
  });

  it("quotes CSS url() values so a path cannot break out", () => {
    expect(cssUrl(`https://cdn.example/a.png")}</style><script>`)).toContain('\\"');
    expect(cssUrl("https://cdn.example/a.png")).toBe('url("https://cdn.example/a.png")');
  });

  it("does not emit operator HTML in generated hotspot pages", () => {
    const files = renderPortalFiles({
      businessName: `<img src=x onerror=alert(1)>`,
      welcomeText: `</style><script>alert(1)</script>`,
      terms: `<script>document.cookie</script>`,
      primaryHex: `#00ff00;}</style><script>alert(1)</script>`,
      glassTintHex: `url(javascript:alert(1))`,
      guestMode: "voucher_only",
    });
    const login = files.find((f) => f.name === "login.html")!.content;
    const css = files.find((f) => f.name === "style.css")!.content;
    expect(login).toContain("&lt;img");
    expect(login).not.toContain("<img src=x");
    expect(login).not.toContain("<script>alert");
    expect(css).toContain("--primary:#ffb547");
    expect(css).not.toContain("javascript:");
    expect(css).not.toContain("</style>");
  });
});

describe("browser security headers", () => {
  it("sets CSP, nosniff, frame and referrer on production https", () => {
    const h = securityHeadersFor(new Request("https://mikromagic.example/app"));
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["content-security-policy"]).toContain("worker-src 'self'");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(h["content-security-policy"]).toContain("script-src-attr 'none'");
    expect(h["content-security-policy"]).toContain("upgrade-insecure-requests");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("SAMEORIGIN");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
  });

  it("does not force HTTPS upgrades on localhost", () => {
    const h = securityHeadersFor(new Request("http://localhost:8080/app"));
    expect(h["strict-transport-security"]).toBeUndefined();
    expect(h["content-security-policy"]).not.toContain("upgrade-insecure-requests");
    expect(h["content-security-policy"]).toContain("ws:");
  });

  it("marks HTML as no-store and leaves existing headers in place", () => {
    const html = withSecurityHeaders(
      new Request("https://example.com/app"),
      new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(html.headers.get("cache-control")).toBe("no-store");
    expect(html.headers.get("x-content-type-options")).toBe("nosniff");

    const preset = withSecurityHeaders(
      new Request("https://example.com/app"),
      new Response("ok", {
        status: 200,
        headers: { "x-frame-options": "DENY", "content-type": "text/plain" },
      }),
    );
    expect(preset.headers.get("x-frame-options")).toBe("DENY");
  });

  it("opts HTML out of AI training and noindexes private chrome", () => {
    expect(htmlRobotsTagFor("/")).toBe("noai, noimageai");
    expect(htmlRobotsTagFor("/pricing")).toBe("noai, noimageai");
    expect(htmlRobotsTagFor("/app")).toBe("noindex, nofollow, noai, noimageai");
    expect(htmlRobotsTagFor("/app/vouchers")).toBe("noindex, nofollow, noai, noimageai");
    expect(htmlRobotsTagFor("/auth")).toBe("noindex, nofollow, noai, noimageai");
    expect(htmlRobotsTagFor("/dev/ux-shell")).toBe("noindex, nofollow, noai, noimageai");

    const landing = withSecurityHeaders(
      new Request("https://example.com/pricing"),
      new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect(landing.headers.get("x-robots-tag")).toBe("noai, noimageai");

    const app = withSecurityHeaders(
      new Request("https://example.com/app/vouchers"),
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    expect(app.headers.get("x-robots-tag")).toBe("noindex, nofollow, noai, noimageai");

    const json = withSecurityHeaders(
      new Request("https://example.com/api/public/checkout/status"),
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    expect(json.headers.get("x-robots-tag")).toBeNull();
  });
});

describe("AI crawler policy", () => {
  it("ships robots.txt that blocks app/auth/dev and generative-AI bots", () => {
    const robots = readFileSync("public/robots.txt", "utf8");
    for (const path of ["/app", "/auth", "/dev", "/api", "/mcp"]) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
    for (const agent of [
      "GPTBot",
      "ChatGPT-User",
      "OAI-SearchBot",
      "Google-Extended",
      "ClaudeBot",
      "Claude-User",
      "Applebot-Extended",
      "Bytespider",
      "CCBot",
      "PerplexityBot",
    ]) {
      expect(robots).toContain(`User-agent: ${agent}`);
    }
    expect(robots).toMatch(/User-agent:\s*GPTBot[\s\S]*Disallow:\s*\//);
  });
});

describe("tenant grant listing filter", () => {
  it("drops rows whose user_id is outside the allowed set", () => {
    const rows = [
      { user_id: "aaa", feature: "vouchers" },
      { user_id: "bbb", feature: "reboot" },
    ];
    expect(filterByUserIdSet(rows, new Set(["aaa"]))).toEqual([
      { user_id: "aaa", feature: "vouchers" },
    ]);
    expect(filterByUserIdSet(rows, null)).toEqual(rows);
  });
});

describe("SQL hardening is in the repo", () => {
  it("requires owner folder + uid on payment-receipt inserts", () => {
    const sql = readFileSync(
      "supabase/migrations/20260818160000_production_security_hardening.sql",
      "utf8",
    );
    expect(sql).toContain("payment receipts owner insert");
    expect(sql).toContain(
      "(storage.foldername(name))[1] = (public.effective_owner(auth.uid()))::text",
    );
    expect(sql).toContain("(storage.foldername(name))[2] = (auth.uid())::text");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon/);
  });

  it("ships copy-paste SQL for Lovable Cloud", () => {
    const run1 = readFileSync(".lovable/sql/security-run1-storage.sql", "utf8");
    const run2 = readFileSync(".lovable/sql/security-run2-definer-grants.sql", "utf8");
    const run3 = readFileSync(".lovable/sql/security-run3-global-platform-rls.sql", "utf8");
    expect(run1).toContain("payment receipts owner insert");
    expect(run2).toContain("private.list_features");
    expect(run2).toContain("operator_feature_grants");
    expect(run2).toContain("to_regclass('public.feature_user_grants')");
    expect(run2).toContain("effective_owner(user_id) = public.effective_owner(auth.uid())");
    const focused = readFileSync(".lovable/sql/list-features-live-grants.sql", "utf8");
    expect(focused).toContain("private.list_features");
    expect(focused).toContain("to_regclass('public.operator_feature_grants')");
    expect(focused).toContain("LANGUAGE plpgsql");
    const hardening = readFileSync(
      "supabase/migrations/20260818160000_production_security_hardening.sql",
      "utf8",
    );
    expect(hardening).toContain("to_regclass('public.operator_feature_grants')");
    expect(hardening).toMatch(/FUNCTION private\.list_features[\s\S]*LANGUAGE plpgsql/);
    expect(hardening).not.toMatch(
      /FUNCTION private\.list_features[\s\S]*LANGUAGE sql[\s\S]*FROM public\.feature_user_grants g/,
    );
    expect(run3).toContain("operator_feature_role_defaults platform write");
    expect(run3).toContain("portal_mode_role_defaults platform write");
    expect(run3).toContain("Platform admins can update the pricing promo");
    expect(run3).not.toMatch(/has_role\s*\(/);
  });

  it("locks global platform tables to is_platform_admin only", () => {
    const sql = readFileSync(
      "supabase/migrations/20260818200000_global_platform_table_rls.sql",
      "utf8",
    );
    expect(sql).toContain("operator_feature_role_defaults platform write");
    expect(sql).toContain("portal_mode_role_defaults platform write");
    expect(sql).toContain("Platform admins can update the pricing promo");
    expect(sql).not.toMatch(/has_role\s*\(/);
    expect(sql).not.toMatch(/has_tenant_role\s*\(/);
  });

  it("requires platform admin for global role-default server writes", () => {
    expect(readFileSync("src/lib/operator-grants.functions.ts", "utf8")).toContain(
      "requirePlatformAdmin(context)",
    );
    expect(readFileSync("src/lib/portal-grants.functions.ts", "utf8")).toContain(
      "requirePlatformAdmin(context)",
    );
  });

  it("scopes role-default SELECT away from USING(true)", () => {
    const sql = readFileSync(
      "supabase/migrations/20260818220000_role_defaults_select_scope.sql",
      "utf8",
    );
    const run4 = readFileSync(".lovable/sql/security-run4-role-defaults-select.sql", "utf8");
    for (const src of [sql, run4]) {
      expect(src).toContain("operator_feature_role_defaults read");
      expect(src).toContain("portal_mode_role_defaults read");
      expect(src).toContain("is_platform_admin(auth.uid())");
      expect(src).toContain("has_role(auth.uid(), role)");
      const policies = src
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");
      expect(policies).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    }
    expect(readFileSync("src/lib/operator-grants.functions.ts", "utf8")).toContain('.in("role"');
    expect(readFileSync("src/lib/portal-grants.functions.ts", "utf8")).toContain('.in("role"');
  });

  it("does not reintroduce USING(true) role-default reads in copy-paste SQL", () => {
    for (const path of [
      ".lovable/sql/operator-feature-grants.sql",
      ".lovable/sql/portal-modes-run1-grants.sql",
    ]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/role_defaults read[\s\S]*USING \(true\)/);
    }
  });
});
