/**
 * Shared RouterOS snippets for clock honesty before TLS / schedules.
 * Product wall time is Asia/Yangon (UTC+06:30) — platform and routers stay locked
 * together so Hub linking, vouchers, and schedules stay aligned.
 */
import { APP_TIMEZONE } from "./time";
import type { RouterConn } from "./mikrotik.server";

export const ROUTER_NTP_SERVERS = "pool.ntp.org,asia.pool.ntp.org";

/** Loose IANA-ish check for sites.timezone free-text (avoid injecting RouterOS junk). */
export function isPlausibleTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  const t = tz.trim();
  if (t.length < 3 || t.length > 64) return false;
  if (!/^[A-Za-z0-9_+\-/]+$/.test(t)) return false;
  if (!t.includes("/")) return false;
  return true;
}

/**
 * Router wall clock always uses the app timezone (Asia/Yangon).
 * Site timezone fields are informational only — do not diverge boards from the platform.
 */
export function resolveRouterTimezone(_siteTimezone?: string | null | undefined): string {
  return APP_TIMEZONE;
}

/**
 * RouterOS script fragment: enable NTP, set timezone, brief wait so cert
 * signing is less likely on a 1970 clock. Safe to paste more than once.
 */
export function routerosClockPrepSnippet(opts?: {
  timezone?: string;
  waitSeconds?: number;
}): string {
  const tz = resolveRouterTimezone(opts?.timezone);
  const wait = Math.max(2, Math.min(opts?.waitSeconds ?? 8, 30));
  return `:put "=== Clock prep (NTP + ${tz}) ==="
:do { /system/ntp/client/set enabled=yes } on-error={}
:if ([:len [/system/ntp/client/servers/find where address=pool.ntp.org]] = 0) do={ :do { /system/ntp/client/servers/add address=pool.ntp.org } on-error={} }
:if ([:len [/system/ntp/client/servers/find where address=asia.pool.ntp.org]] = 0) do={ :do { /system/ntp/client/servers/add address=asia.pool.ntp.org } on-error={} }
:do { /system clock set time-zone-autodetect=no time-zone-name=${tz} } on-error={}
:delay ${wait}s
:put ("Clock now: " . [/system clock get date] . " " . [/system clock get time] . " " . [/system clock get time-zone-name])
`;
}

/**
 * Live REST/CLI: enable NTP + Asia/Yangon on a connected router (plan push, etc.).
 * Best-effort — returns a warning string on failure, null on success.
 */
export async function ensureRouterClockAligned(c: RouterConn): Promise<string | null> {
  const { routerAPI } = await import("./mikrotik.server");
  const tz = APP_TIMEZONE;
  try {
    try {
      await routerAPI.raw(c, "/system/ntp/client/set", {
        method: "POST",
        body: JSON.stringify({ enabled: "yes" }),
      });
    } catch {
      await routerAPI.execScript(c, "/system/ntp/client/set enabled=yes");
    }
    let existing: Array<{ address?: string }> = [];
    try {
      const rows = await routerAPI.raw<Array<{ address?: string }> | { address?: string }>(
        c,
        "/system/ntp/client/servers",
      );
      existing = Array.isArray(rows) ? rows : [rows];
    } catch {
      // Continue with the safe add path when this RouterOS build cannot list the submenu.
    }
    for (const address of ROUTER_NTP_SERVERS.split(",")) {
      if (existing.some((row) => row.address === address)) continue;
      try {
        await routerAPI.raw(c, "/system/ntp/client/servers", {
          method: "PUT",
          body: JSON.stringify({ address }),
        });
      } catch {
        await routerAPI.execScript(c, `/system/ntp/client/servers/add address=${address}`);
      }
    }
    try {
      await routerAPI.setSystemTimezone(c, tz);
    } catch {
      await routerAPI.execScript(
        c,
        `/system clock set time-zone-autodetect=no time-zone-name=${tz}`,
      );
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : `Could not align NTP + timezone to ${tz}`;
  }
}
