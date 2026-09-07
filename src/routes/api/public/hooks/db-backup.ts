// Cron-invoked endpoint: snapshots key tables to the private `db-backups`
// storage bucket as a single JSON file. Gated by CRON_SECRET / private.cron_secrets
// — never the publishable/anon key (that ships in every browser shell).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/db-backup")({
  server: {
    handlers: {
      GET: async () => new Response("POST only", { status: 405 }),
      POST: async ({ request }) => {
        try {
          const { isAuthorizedCronRequest, cronUnauthorizedResponse } =
            await import("@/lib/cron-auth.server");
          if (!(await isAuthorizedCronRequest(request))) return cronUnauthorizedResponse();

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runDbBackupSnapshot } = await import("@/lib/db-backup.server");
          const result = await runDbBackupSnapshot(supabaseAdmin);

          return new Response(JSON.stringify(result), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
