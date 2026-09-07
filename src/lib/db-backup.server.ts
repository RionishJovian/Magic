// Shared DB snapshot used by the cron hook and platform-admin "Run now".
import type { SupabaseClient } from "@supabase/supabase-js";

// Tables to include in the snapshot. Auth-managed tables (auth.*, storage.*)
// are excluded — those are backed up by the platform, not by app logic.
export const DB_BACKUP_TABLES = [
  "profiles",
  "user_roles",
  "owner_accounts",
  "sites",
  "router_connections",
  "router_save_audit",
  "unifi_controllers",
  "portal_plans",
  "portal_settings",
  "portal_mode_grants",
  "portal_mode_role_defaults",
  "portal_deploy_audit",
  "voucher_prices",
  "voucher_sales",
  "terminal_history",
  "terminal_templates",
  "syslog_tokens",
  "syslog_events",
  "fleet_scan_runs",
  "admin_notifications",
  "sandbox_routers",
  "sandbox_state",
] as const;

export type DbBackupResult = {
  ok: true;
  path: string;
  bytes: number;
  counts: Record<string, number>;
  errors?: Record<string, string>;
};

export async function runDbBackupSnapshot(supabaseAdmin: SupabaseClient): Promise<DbBackupResult> {
  const snapshot: Record<string, unknown> = {
    generated_at: new Date().toISOString(),
    version: 1,
    tables: {},
  };
  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};

  for (const t of DB_BACKUP_TABLES) {
    const { data, error } = await supabaseAdmin.from(t).select("*");
    if (error) {
      errors[t] = error.message;
      (snapshot.tables as Record<string, unknown>)[t] = [];
      counts[t] = 0;
    } else {
      (snapshot.tables as Record<string, unknown>)[t] = data ?? [];
      counts[t] = data?.length ?? 0;
    }
  }

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const path = `${y}/${m}/${d}/backup-${stamp}.json`;

  const body = JSON.stringify(snapshot);
  const { error: upErr } = await supabaseAdmin.storage.from("db-backups").upload(path, body, {
    contentType: "application/json",
    upsert: false,
  });
  if (upErr) throw new Error(`storage upload: ${upErr.message}`);

  // Prune backups older than 30 days
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  try {
    const { data: top } = await supabaseAdmin.storage.from("db-backups").list("", { limit: 1000 });
    for (const yr of top ?? []) {
      if (!/^\d{4}$/.test(yr.name)) continue;
      const { data: months } = await supabaseAdmin.storage
        .from("db-backups")
        .list(yr.name, { limit: 1000 });
      for (const mo of months ?? []) {
        const { data: days } = await supabaseAdmin.storage
          .from("db-backups")
          .list(`${yr.name}/${mo.name}`, { limit: 1000 });
        for (const dy of days ?? []) {
          const prefix = `${yr.name}/${mo.name}/${dy.name}`;
          const { data: files } = await supabaseAdmin.storage
            .from("db-backups")
            .list(prefix, { limit: 1000 });
          const toDelete = (files ?? [])
            .filter((f) => {
              const ts = f.created_at ? Date.parse(f.created_at) : NaN;
              return Number.isFinite(ts) && ts < cutoff;
            })
            .map((f) => `${prefix}/${f.name}`);
          if (toDelete.length) await supabaseAdmin.storage.from("db-backups").remove(toDelete);
        }
      }
    }
  } catch (e) {
    console.warn("db-backup prune failed", e);
  }

  return {
    ok: true,
    path,
    bytes: body.length,
    counts,
    errors: Object.keys(errors).length ? errors : undefined,
  };
}
