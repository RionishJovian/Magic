import { createFileRoute } from "@tanstack/react-router";

/**
 * The local connector long-polls this endpoint, claims queued jobs and
 * reports that it is alive. Authenticated with the connector bearer token.
 */
export const Route = createFileRoute("/api/public/connector/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateConnector } = await import("@/lib/connector-auth.server");
        const { connector, error } = await authenticateConnector(request);
        if (!connector) return Response.json({ error }, { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();

        await supabaseAdmin
          .from("connectors")
          .update({ last_seen_at: now, status: "online" })
          .eq("id", connector.id);

        // Claim atomically: only rows still `queued` are returned. Select-then-
        // update without the status guard let two agents both run the same job.
        const claimed: Array<{ id: string; kind: string; request: unknown }> = [];
        for (let i = 0; i < 10; i++) {
          const { data: next } = await supabaseAdmin
            .from("connector_jobs")
            .select("id")
            .eq("connector_id", connector.id)
            .eq("status", "queued")
            .gt("expires_at", now)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (!next) break;

          const { data: row } = await supabaseAdmin
            .from("connector_jobs")
            .update({ status: "claimed", claimed_at: now })
            .eq("id", next.id)
            .eq("status", "queued")
            .select("id, kind, request")
            .maybeSingle();
          if (row) claimed.push(row);
        }

        return Response.json({
          jobs: claimed.map((j) => ({ id: j.id, kind: j.kind, request: j.request })),
        });
      },
    },
  },
});
