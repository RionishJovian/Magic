import { createFileRoute } from "@tanstack/react-router";

// Five-minute worker entry point. The scheduler calls this endpoint; every
// RouterOS operation is read-only and protected router IDs are skipped.
export const Route = createFileRoute("/api/public/hooks/router-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorizedResponse } =
          await import("@/lib/cron-auth.server");
        if (!(await isAuthorizedCronRequest(request))) return cronUnauthorizedResponse();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runHealthSweepForOwner } = await import("@/lib/monitoring.server");
          const { data: rows, error } = await supabaseAdmin
            .from("router_connections")
            .select("owner_id")
            .eq("is_virtual", false);
          if (error) throw new Error(error.message);

          const owners = [...new Set((rows ?? []).map((row) => row.owner_id))];
          const results = [];
          for (const ownerId of owners) {
            try {
              results.push(await runHealthSweepForOwner(ownerId));
            } catch (error) {
              results.push({
                ownerId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
          return Response.json({ ok: true, owners: owners.length, results });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          );
        }
      },
      GET: async () => new Response("POST only", { status: 405 }),
    },
  },
});
