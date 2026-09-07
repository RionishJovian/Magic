import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  job_id: z.string().uuid(),
  status: z.enum(["done", "failed"]),
  response: z
    .object({
      status: z.number().int().min(100).max(599).optional(),
      statusText: z.string().max(200).optional(),
      headers: z.record(z.string(), z.string()).optional(),
      body: z.string().max(2_000_000).optional(),
    })
    .optional(),
  error: z.string().max(2000).optional(),
});

export const Route = createFileRoute("/api/public/connector/result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateConnector } = await import("@/lib/connector-auth.server");
        const { connector, error: authError } = await authenticateConnector(request);
        if (!connector) return Response.json({ error: authError }, { status: 401 });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) return Response.json({ error: "Invalid result" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();

        // Only the authenticated connector's own claimed, unexpired job may be
        // completed — never a queued, finished or foreign job.
        const { data: updated, error } = await supabaseAdmin
          .from("connector_jobs")
          .update({
            status: parsed.data.status,
            response: parsed.data.response
              ? JSON.parse(JSON.stringify(parsed.data.response))
              : null,
            error: parsed.data.error ?? null,
            completed_at: now,
          })
          .eq("id", parsed.data.job_id)
          .eq("connector_id", connector.id)
          .eq("status", "claimed")
          .gt("expires_at", now)
          .select("id");
        if (error) return Response.json({ error: "Could not store result" }, { status: 500 });
        if (!updated || updated.length === 0) {
          return Response.json({ error: "No matching claimed job" }, { status: 404 });
        }

        await supabaseAdmin
          .from("connectors")
          .update({ last_seen_at: now, status: "online" })
          .eq("id", connector.id);

        return Response.json({ ok: true });
      },
    },
  },
});
