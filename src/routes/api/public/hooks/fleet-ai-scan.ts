// Cron-invoked endpoint: runs the AI fleet scan for every owner with routers
// and stores results in fleet_scan_runs. Authenticated with the private
// CRON_SECRET shared secret (x-cron-secret header or Bearer token).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/fleet-ai-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorizedResponse } =
          await import("@/lib/cron-auth.server");
        if (!(await isAuthorizedCronRequest(request))) return cronUnauthorizedResponse();

        const { withRouteTiming } = await import("@/lib/timing.middleware");
        try {
          return await withRouteTiming("hooks/fleet-ai-scan", async () => {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { runAiScanForOwner } = await import("@/lib/fleet-ai.server");
            const { data: rows, error } = await supabaseAdmin
              .from("router_connections")
              .select("id, name, host, owner_id, connection_mode, connector_id");
            if (error) throw new Error(error.message);
            const groups = new Map<string, typeof rows>();
            for (const r of rows ?? []) {
              const list = groups.get(r.owner_id) ?? [];
              list.push(r);
              groups.set(r.owner_id, list);
            }
            const results = [];
            for (const [ownerId, list] of groups) {
              const runStart = performance.now();
              try {
                const out = await runAiScanForOwner(ownerId, list ?? [], null);
                results.push(out);
                console.log(
                  JSON.stringify({
                    tag: "fleet-ai.owner",
                    owner_id: ownerId,
                    routers: list?.length ?? 0,
                    ms: Math.round(performance.now() - runStart),
                    ok: true,
                  }),
                );
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                results.push({ owner_id: ownerId, error: msg });
                console.error(
                  JSON.stringify({
                    tag: "fleet-ai.owner",
                    owner_id: ownerId,
                    routers: list?.length ?? 0,
                    ms: Math.round(performance.now() - runStart),
                    ok: false,
                    error: msg.slice(0, 200),
                  }),
                );
              }
            }
            return new Response(JSON.stringify({ ok: true, owners: results.length, results }), {
              headers: { "content-type": "application/json" },
            });
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
      GET: async () => new Response("POST only", { status: 405 }),
    },
  },
});
