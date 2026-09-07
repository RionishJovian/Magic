import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/routes/_authenticated/app.tsx", "utf8");

describe("app broadcast banner", () => {
  it("does not render the temporary Magic Hub outage marquee", () => {
    expect(shell).not.toContain("broadcast-marquee");
    expect(shell).not.toContain("Magic Hub's services are temporary out of service");
  });
});
