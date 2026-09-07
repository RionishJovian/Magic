import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync("src/routes/_authenticated/app.index.tsx", "utf8");
const topology = readFileSync("src/lib/topology.functions.ts", "utf8");

describe("Home Site topology", () => {
  it("restores Site topology in place of Home live telemetry", () => {
    expect(home).toContain("function HomeSiteTopology({ canOpenFull }");
    expect(home).toContain("<HomeSiteTopology canOpenFull={showDevBadge} />");
    expect(home).toContain("<SiteTopologyCanvas snapshot={topology.data} />");
    expect(home).not.toContain("LiveTelemetryDashboard");
  });

  it("uses dedicated tenant-scoped reads without weakening the admin topology page", () => {
    expect(topology).toContain("listHomeTopologySites");
    expect(topology).toContain("getHomeSiteTopology");
    expect(topology).toContain('.eq("owner_id", scope.ownerId)');
    expect(topology).toContain("resolveHomeTopologyScope");
    expect(topology).toContain("assertTopologyPlatformAccess");
  });

  it("cannot remain in an endless loading state and gives new trials setup actions", () => {
    expect(home).toContain("function topologyRequest");
    expect(home).toContain("12_000");
    expect(home).toContain("sites.error");
    expect(home).toContain("sites.refetch()");
    expect(home).toContain("topology.refetch()");
    expect(home).toContain('to="/app/sites"');
    expect(home).toContain('to="/app/routers"');
  });
});
