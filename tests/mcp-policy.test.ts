import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MCP_DISABLED_WRITE_TOOLS, MCP_READ_ONLY_TOOLS, isReadOnlyToolSet } from "@/lib/mcp/policy";
import { SANDBOX_WORKFLOW, simulateWorkflow } from "@/lib/test-lab/sandbox-fixtures";

describe("MCP least privilege", () => {
  const manifest = JSON.parse(readFileSync("./.lovable/mcp/manifest.json", "utf8")) as {
    mcp: { tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }> };
  };
  const source = readFileSync("./src/lib/mcp/index.ts", "utf8");

  it("advertises exactly the documented read-only tools", () => {
    const names = manifest.mcp.tools.map((t) => t.name).sort();
    expect(names).toEqual(MCP_READ_ONLY_TOOLS.map((t) => t.name).sort());
    expect(isReadOnlyToolSet(names)).toBe(true);
    for (const tool of manifest.mcp.tools) expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  it("keeps every write tool unregistered in the manifest and the server entry", () => {
    const advertised = manifest.mcp.tools.map((t) => t.name);
    for (const w of MCP_DISABLED_WRITE_TOOLS) expect(advertised).not.toContain(w.name);
    // The registered tool array must not mention the write modules.
    const registered = source.slice(source.indexOf("tools: ["));
    for (const fragment of ["createVoucher", "kickUser", "banMac"])
      expect(registered).not.toContain(fragment);
  });

  it("keeps the OAuth issuer requirement in the server entry", () => {
    expect(manifest.auth.type).toBe("oauth");
    expect(manifest.mcp.tools.length).toBeGreaterThan(0);
    expect(source).toContain("auth.oauth.issuer");
    expect(source).toContain('acceptedAudiences: "authenticated"');
  });

  it("rejects an unknown tool name", () => {
    expect(isReadOnlyToolSet(["list_routers", "kick_user"])).toBe(false);
    expect(isReadOnlyToolSet([])).toBe(false);
  });
});

describe("get_router_reachability aggregate contract", () => {
  const toolSource = readFileSync(
    new URL("../src/lib/mcp/tools/get-router-reachability.ts", import.meta.url),
    "utf8",
  );
  const manifest = JSON.parse(readFileSync("./.lovable/mcp/manifest.json", "utf8")) as {
    mcp: {
      tools: Array<{
        name: string;
        annotations?: { readOnlyHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
        inputSchema?: { properties?: Record<string, unknown> };
      }>;
    };
  };

  it("advertises the tool with read-only, idempotent annotations and no input", () => {
    const tool = manifest.mcp.tools.find((t) => t.name === "get_router_reachability");
    expect(tool).toBeDefined();
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(Object.keys(tool?.inputSchema?.properties ?? {})).toHaveLength(0);
  });

  it("returns only aggregate fields and never router-level detail", () => {
    // Scope to the handler body (the defineTool metadata legitimately has name:/title:).
    const handler = toolSource.slice(toolSource.indexOf("handler:"));
    // The success payload is a single counts-only object.
    for (const ok of ["total", "reachable", "unreachable", "status"]) expect(handler).toContain(ok);
    // Forbidden detail fields must not appear in anything the handler returns.
    for (const forbidden of [
      "name:",
      "host:",
      "port:",
      "username",
      "error:",
      "observedAt",
      "results",
      "e.message",
      "String(e)",
      "new Date(",
    ])
      expect(handler).not.toContain(forbidden);
    // The generic error text is fixed — no exception interpolation.
    expect(handler).toContain("temporarily unavailable");
  });

  it("uses only the established read-only ping path and requires auth", () => {
    expect(toolSource).toContain("ctx.isAuthenticated()");
    expect(toolSource).toContain("supabaseForMcpUser");
    expect(toolSource).toContain("filterPhysicalRouters");
    expect(toolSource).toContain("routerAPI.ping");
    // No write or admin surface.
    for (const forbidden of ["terminal", "provision", "deploy", "supabaseAdmin", "SERVICE_ROLE"])
      expect(toolSource).not.toContain(forbidden);
  });
});

describe("sandbox simulation", () => {
  it("runs read-only steps before any write step", () => {
    const firstWrite = SANDBOX_WORKFLOW.findIndex((s) => s.writes);
    expect(SANDBOX_WORKFLOW.slice(0, firstWrite).every((s) => !s.writes)).toBe(true);
  });

  it("reports a rollback when a step fails and stops there", () => {
    const results = simulateWorkflow("apply");
    expect(results.map((r) => r.step)).toEqual(["endpoint", "check", "plan", "apply", "rollback"]);
    expect(results.find((r) => r.step === "apply")?.outcome).toBe("failed");
    expect(results.at(-1)).toMatchObject({ step: "rollback", outcome: "ok" });
  });

  it("completes every step when nothing fails", () => {
    expect(simulateWorkflow().every((r) => r.outcome === "ok")).toBe(true);
  });
});

describe("real-router server functions stay privileged", () => {
  const testRouterSource = readFileSync(
    new URL("../src/lib/test-router.functions.ts", import.meta.url),
    "utf8",
  );
  const auditSource = readFileSync(
    new URL("../src/lib/audit.functions.ts", import.meta.url),
    "utf8",
  );

  it("guards every real-hardware server function with requirePrivileged", () => {
    for (const [source, fn] of [
      [testRouterSource, "checkRouterConnection"],
      [testRouterSource, "listRoutersByEnvironment"],
      [auditSource, "listRouterOpsAudit"],
      [testRouterSource, "setInsecureTlsException"],
    ] as const) {
      const start = source.indexOf(`export const ${fn} =`);
      expect(start, `${fn} must exist`).toBeGreaterThan(-1);
      const next = source.indexOf("\nexport const ", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      expect(body, `${fn} must require owner/admin`).toContain("requirePrivileged");
    }
  });

  it("keeps the MCP simulation fixtures free of any network or database access", () => {
    const sandbox = readFileSync(
      new URL("../src/lib/test-lab/sandbox-fixtures.ts", import.meta.url),
      "utf8",
    );
    expect(sandbox).not.toMatch(/fetch\(|supabase|createServerFn|http/i);
  });
});
