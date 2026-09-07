import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  code: z.string().trim().min(6).max(40),
  version: z.string().max(40).optional(),
  hostname: z.string().max(120).optional(),
  local_ip: z.string().max(60).optional(),
  local_subnet: z.string().max(60).optional(),
});

export const Route = createFileRoute("/api/public/connector/pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success)
          return Response.json({ error: "Invalid pairing request" }, { status: 400 });

        const { hashToken, newToken } = await import("@/lib/connector.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const codeHash = hashToken(parsed.data.code.trim().toUpperCase());
        const token = newToken();
        const now = new Date().toISOString();

        // Atomic consume: only one POST wins the pairing_code_hash match.
        const { data: connector, error } = await supabaseAdmin
          .from("connectors")
          .update({
            token_hash: hashToken(token),
            pairing_code_hash: null,
            pairing_code_expires_at: null,
            paired_at: now,
            last_seen_at: now,
            status: "online",
            version: parsed.data.version ?? null,
            hostname: parsed.data.hostname ?? null,
            local_ip: parsed.data.local_ip ?? null,
            local_subnet: parsed.data.local_subnet ?? null,
          })
          .eq("pairing_code_hash", codeHash)
          .eq("enabled", true)
          .gt("pairing_code_expires_at", now)
          .select("id, public_id")
          .maybeSingle();

        if (error) return Response.json({ error: "Pairing failed" }, { status: 500 });
        if (!connector) return Response.json({ error: "Invalid pairing code" }, { status: 401 });

        return Response.json({ connector_id: connector.public_id, token });
      },
    },
  },
});
