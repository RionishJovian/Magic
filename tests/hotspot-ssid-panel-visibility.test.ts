import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/HotspotSsidPanel.tsx", "utf8");

describe("Hotspot Wi-Fi panel visibility", () => {
  it("stays collapsed by default so Routers does not probe every card on load", () => {
    // First useState in this component is panelOpen — must be false.
    expect(panel).toMatch(/const \[panelOpen, setPanelOpen\] = useState\(false\)/);
    expect(panel).toContain("Set up built-in Wi‑Fi or connect an external guest AP");
    expect(panel).toContain("Reading router Wi‑Fi and hotspot");
    expect(panel).toContain("Retry");
    expect(panel).toContain("Built-in Wi‑Fi");
    expect(panel).toContain("Set up hotspot");
    expect(panel).toContain("LAN ports (AP / switch)");
    expect(panel).toContain("Select all");
    expect(panel).toContain("Select only the LAN ports connected to your guest AP or switch");
    expect(panel).toContain("Connected AP SSIDs");
    expect(panel).toContain("scanConnectedApSsids");
    expect(panel).toContain('enabled: panelOpen && mode === "lan-port"');
    expect(panel).toContain("You can still enter the SSID manually");
    expect(panel.match(/setLanPorts\(data\.etherPorts\.map\(\(p\) => p\.name\)\)/g)).toHaveLength(
      1,
    );
  });
});
