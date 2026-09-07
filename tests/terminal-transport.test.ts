import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Terminal used to dial host:port with raw fetch, which skips Magic Hub
 * (`baseUrlOverride`) and Local Connector (`connectorFetch`). Keep the runner
 * on the shared `exchange` / `loadRouterConn` path so a CCR that passes
 * Routers → Test also answers Advanced → Terminal.
 */
describe("Terminal REST transport", () => {
  it("routes free-form commands through exchange + loadRouterConn", () => {
    const src = readFileSync("src/lib/fleet.functions.ts", "utf8");
    const runner = src.slice(src.indexOf("export const runTerminalCommand"));
    const end = runner.indexOf("export const applyInsightFix");
    const body = end === -1 ? runner : runner.slice(0, end);

    expect(body).toContain("loadRouterConn");
    expect(body).toContain("exchange");
    expect(body).not.toMatch(/decryptSecret/);
    expect(body).not.toMatch(/baseUrlOverride\s*\?\?/);
    expect(body).not.toMatch(/await fetch\(url/);
  });

  it("exposes exchange on the shared MikroTik client", () => {
    const src = readFileSync("src/lib/mikrotik.server.ts", "utf8");
    expect(src).toMatch(/export async function exchange\s*\(/);
    expect(src).toContain("connectorFetch");
    expect(src).toContain("baseUrlOverride");
    expect(src).not.toContain("sandboxFetch");
    expect(src).toContain("sandboxRouterId");
  });
});
