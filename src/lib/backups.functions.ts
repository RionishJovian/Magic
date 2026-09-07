import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DatabaseClient } from "./database.types";
import { isRecord, numberValue } from "./database.types";

// Database backups span every tenant, so they are restricted to explicitly
// listed platform administrators rather than any account holding "owner".
async function assertOwner(ctx: { supabase: DatabaseClient; userId: string }) {
  const { requirePlatformAdmin } = await import("./admin-scope.server");
  await requirePlatformAdmin(ctx);
}

export const listDbBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const files: Array<{ path: string; size: number; created_at: string | null }> = [];
    const walk = async (prefix: string, depth: number) => {
      const { data, error } = await supabaseAdmin.storage
        .from("db-backups")
        .list(prefix, { limit: 1000, sortBy: { column: "name", order: "desc" } });
      if (error) return;
      for (const item of data ?? []) {
        const full = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) {
          if (depth < 3) await walk(full, depth + 1);
        } else {
          files.push({
            path: full,
            size: numberValue(isRecord(item.metadata) ? item.metadata.size : 0),
            created_at: item.created_at ?? null,
          });
        }
      }
    };
    await walk("", 0);
    files.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return files.slice(0, 100);
  });

export const signDbBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ path: z.string().min(1).max(500) }).parse(v))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("db-backups")
      .createSignedUrl(data.path, 300);
    if (error || !signed) throw new Error(error?.message ?? "sign failed");
    return { url: signed.signedUrl };
  });

export const runDbBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    // Call the snapshot directly — do not HTTP round-trip through the public
    // cron hook with a browser-visible key.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runDbBackupSnapshot } = await import("./db-backup.server");
    return runDbBackupSnapshot(supabaseAdmin);
  });
