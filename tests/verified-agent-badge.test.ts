import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Verified Agent badge", () => {
  const badge = readFileSync("src/components/VerifiedAgentBadge.tsx", "utf8");
  const users = readFileSync("src/routes/_authenticated/app.users.tsx", "utf8");
  const shell = readFileSync("src/routes/_authenticated/app.tsx", "utf8");
  const profile = readFileSync("src/routes/_authenticated/app.profile.tsx", "utf8");
  const greeting = readFileSync("src/components/DashboardGreeting.tsx", "utf8");
  const css = readFileSync("src/styles.css", "utf8");

  it("defines a Verified Agent badge component", () => {
    expect(badge).toContain("Verified Agent");
    expect(badge).toContain("agent-badge");
    expect(css).toContain(".agent-badge");
  });

  it("shows the badge for Agent rows on Users (existing and newly assigned)", () => {
    expect(users).toContain("VerifiedAgentBadge");
    expect(users).toMatch(/role === ["']agent["'][\s\S]*VerifiedAgentBadge/);
    expect(users).toContain('<option value="agent">Verified Agent</option>');
  });

  it("shows the badge in the shell and profile for signed-in Agents", () => {
    expect(shell).toContain("VerifiedAgentBadge");
    expect(shell).toContain('roles.includes("agent")');
    expect(profile).toContain("VerifiedAgentBadge");
    expect(profile).toContain('primary === "agent"');
    expect(greeting).toContain("showAgentBadge");
  });
});
