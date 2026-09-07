/**
 * Deterministic Fleet insights from real probe data. No LLM invention —
 * every finding cites measured fields from the physical (or sandbox) board.
 */
import type { FleetInsight } from "./fleet-health";
import { memoryUsedPercent } from "./fleet-health";

export type DetectorSnapshot = {
  id: string;
  name: string;
  online: boolean;
  error?: string;
  board_name?: string;
  version?: string;
  cpu_load?: number;
  free_memory?: number;
  total_memory?: number;
  uptime?: string;
  active_sessions?: number;
  temperature_c?: number;
  interfaces_down?: Array<{ name: string; type?: string }>;
  dhcp_pools?: Array<{ name: string; total: number; used: number }>;
  wireguard_peers?: { total: number; handshake_ok: number };
  firewall_rules?: number;
  queue_trees?: number;
};

function slug(parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function buildDeterministicInsights(snapshots: DetectorSnapshot[]): FleetInsight[] {
  const out: FleetInsight[] = [];

  for (const s of snapshots) {
    const board = s.board_name ? ` · ${s.board_name}` : "";
    if (!s.online) {
      out.push({
        id: slug(["unreachable", s.id]),
        severity: "critical",
        title: "Router unreachable",
        subtitle: `${s.name}${board} · ${s.error ?? "no response"}`,
        router: s.name,
        router_id: s.id,
        suggestion:
          "Check Cloud Remote / Magic Hub / Local Connector path, then re-test from Routers.",
      });
      continue;
    }

    if (s.cpu_load != null && s.cpu_load >= 85) {
      out.push({
        id: slug(["cpu-high", s.id]),
        severity: "warning",
        title: "CPU load high",
        subtitle: `${s.name}${board} · cpu-load ${s.cpu_load}%`,
        router: s.name,
        router_id: s.id,
        suggestion:
          "Inspect top processes and traffic; consider rate limits or moving heavy services.",
        fix_command: undefined,
      });
    }

    const memPct = memoryUsedPercent(s.total_memory, s.free_memory);
    if (memPct != null && memPct >= 85) {
      out.push({
        id: slug(["mem-high", s.id]),
        severity: "warning",
        title: "Memory nearly full",
        subtitle: `${s.name}${board} · memory ${memPct}% used`,
        router: s.name,
        router_id: s.id,
        suggestion:
          "Review hotspot users, queues, and connection tracking; reboot only as last resort.",
      });
    }

    if (s.temperature_c != null && s.temperature_c >= 70) {
      out.push({
        id: slug(["temp-high", s.id]),
        severity: s.temperature_c >= 80 ? "critical" : "warning",
        title: "Board temperature high",
        subtitle: `${s.name}${board} · ${s.temperature_c}°C`,
        router: s.name,
        router_id: s.id,
        suggestion: "Check airflow and ambient temperature around the RouterBOARD.",
      });
    }

    for (const iface of s.interfaces_down ?? []) {
      // Skip virtual / unused types that often sit idle by design.
      const t = (iface.type ?? "").toLowerCase();
      if (t === "loopback" || t === "bridge" || t === "vlan" || t === "pppoe-out") continue;
      out.push({
        id: slug(["iface-down", s.id, iface.name]),
        severity: t.includes("wlan") || t.startsWith("ether") ? "critical" : "warning",
        title: "Interface down",
        subtitle: `${s.name}${board} · ${iface.name}${iface.type ? ` (${iface.type})` : ""} carrier down`,
        router: s.name,
        router_id: s.id,
        suggestion: `Enable ${iface.name} if it should be up, or document why it is intentionally down.`,
        fix_command: `/interface enable [find name="${iface.name}"]`,
      });
    }

    for (const pool of s.dhcp_pools ?? []) {
      if (pool.total <= 0) continue;
      const pct = Math.round((pool.used / pool.total) * 100);
      if (pct < 90) continue;
      out.push({
        id: slug(["dhcp-pool", s.id, pool.name]),
        severity: pct >= 95 ? "critical" : "warning",
        title: "DHCP pool nearly exhausted",
        subtitle: `${s.name}${board} · pool ${pool.name} ${pool.used}/${pool.total} (${pct}%)`,
        router: s.name,
        router_id: s.id,
        suggestion:
          "Expand the pool ranges or reclaim stale leases before guests fail to get an address.",
      });
    }

    if (s.wireguard_peers && s.wireguard_peers.total > 0) {
      const missing = s.wireguard_peers.total - s.wireguard_peers.handshake_ok;
      if (missing > 0) {
        out.push({
          id: slug(["wg-peers", s.id]),
          severity: "warning",
          title: "WireGuard peer handshake missing",
          subtitle: `${s.name}${board} · ${s.wireguard_peers.handshake_ok}/${s.wireguard_peers.total} peers with recent handshake`,
          router: s.name,
          router_id: s.id,
          suggestion:
            "Check peer endpoint reachability and keys; re-run Cloud / WireGuard check from Routers.",
        });
      }
    }
  }

  // Most urgent first.
  const rank = (s: string) => (s === "critical" ? 0 : s === "warning" ? 1 : 2);
  out.sort((a, b) => rank(a.severity) - rank(b.severity));
  return out.slice(0, 12);
}
