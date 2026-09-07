/** Presentational counts for the FW / WireGuard / queues / syslog strip. */

export type WireguardPeerCount = { total: number; handshake_ok: number };

export type ServiceCounts = {
  firewall_rules: number | null;
  wireguard: WireguardPeerCount | null;
  queue_trees: number | null;
  syslog_today: number | null;
};

export function formatRuleCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n} rules`;
}

export function formatWgPeers(wg: WireguardPeerCount | null | undefined): string {
  if (!wg) return "—";
  if (wg.total === 0) return "0 peers";
  return `${wg.handshake_ok}/${wg.total} handshake`;
}

export function formatTreeCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n} trees`;
}

export function formatSyslogToday(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n} today`;
}
