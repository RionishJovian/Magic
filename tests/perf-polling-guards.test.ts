import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("operator polling stays light on first paint", () => {
  it("Home skips Hotspot probe on the go-live strip", () => {
    expect(read("src/routes/_authenticated/app.index.tsx")).toMatch(
      /MagicGoLiveStrip[^>]*skipHotspotProbe/,
    );
  });

  it("Sites map uses routersStatus, not deep fleet health", () => {
    const sites = read("src/routes/_authenticated/app.sites.tsx");
    expect(sites).toContain('queryKey: ["routers-status"]');
    expect(sites).toContain("routersStatus");
    expect(sites).not.toContain("getFleetHealth");
    expect(sites).not.toContain('queryKey: ["fleet-health"]');
  });

  it("Home telemetry polls slower than the open Routers panel", () => {
    const tel = read("src/components/LiveTelemetryDashboard.tsx");
    expect(tel).toMatch(/showInterfaceList \? 10_000 : 15_000/);
  });

  it("Routers and Connectors do not poll in background tabs", () => {
    expect(read("src/routes/_authenticated/app.routers.tsx")).toContain(
      "refetchIntervalInBackground: false",
    );
    expect(read("src/routes/_authenticated/app.connectors.tsx")).toContain(
      "refetchIntervalInBackground: false",
    );
  });
});
