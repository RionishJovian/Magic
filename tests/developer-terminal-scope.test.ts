import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("developer terminal tenant scope", () => {
  const server = readFileSync("src/lib/fleet.functions.ts", "utf8");
  const page = readFileSync("src/routes/_authenticated/app.terminal.tsx", "utf8");

  it("returns a redacted platform-admin router picker", () => {
    expect(server).toContain("listTerminalRouters");
    expect(server).toContain("isPlatformAdmin");
    expect(server).not.toContain('select("id, name, owner_id, connection_mode, is_virtual, host');
    expect(server).toContain("ownerLabel");
  });

  it("requires a reason and creates an audit record for cross-tenant writes", () => {
    expect(server).toContain("A support reason is required");
    expect(server).toContain(
      'action: data.method === "GET" ? "developer_terminal_read" : "developer_terminal_write"',
    );
    expect(server).toContain("redactText(text)");
    expect(server).toContain("body: data.body ? redactText(data.body) : null");
  });

  it("shows developer support state without offering WebFig from Terminal", () => {
    expect(page).toContain("Developer support mode");
    expect(page).toContain("Support reason required for a write");
    expect(page).not.toContain("WebfigButton");
  });
});
