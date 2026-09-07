import type { RouterConn } from "../mikrotik.server";

/** Block plan writes when the Hotspot is unusable; external-AP uncertainty remains a UI warning. */
export async function assertHotspotReadyForPlanPush(conn: RouterConn): Promise<void> {
  const { probeWifiHotspot, assessHotspotGuestReady } = await import("../wifi-hotspot.server");
  const probe = await probeWifiHotspot(conn);
  const ready = assessHotspotGuestReady(probe);
  if (ready.level === "block") {
    throw new Error(ready.summary);
  }
}
