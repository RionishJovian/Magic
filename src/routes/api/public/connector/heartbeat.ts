import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  version: z.string().max(40).optional(),
  hostname: z.string().max(120).optional(),
  local_ip: z.string().max(60).optional(),
  local_subnet: z.string().max(60).optional(),
});

export const Route = createFileRoute("/api/public/connector/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateConnector } = await import("@/lib/connector-auth.server");
        const { connector, error } = await authenticateConnector(request);
        if (!connector) return Response.json({ error }, { status: 401 });

        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          /* heartbeat without metadata is fine */
        }
        const parsed = schema.safeParse(body);
        const meta = parsed.success ? parsed.data : {};

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("connectors")
          .update({
            last_seen_at: new Date().toISOString(),
            status: "online",
            ...(meta.version ? { version: meta.version } : {}),
            ...(meta.hostname ? { hostname: meta.hostname } : {}),
            ...(meta.local_ip ? { local_ip: meta.local_ip } : {}),
            ...(meta.local_subnet ? { local_subnet: meta.local_subnet } : {}),
          })
          .eq("id", connector.id);

        return Response.json({ ok: true });
      },
    },
  },
});
