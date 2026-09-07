// Public syslog ingest. RouterOS 7 posts new /log lines (text/plain) or JSON.
// Token is in the URL (fetch-friendly) or Authorization: Bearer. Lookup is by
// SHA-256 hash — plaintext is never stored.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/syslog/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { ingestSyslogPost, createSupabaseSyslogIngestDb } =
          await import("@/lib/syslog-ingest.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rawText = await request.text();
        const clientIp =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          request.headers.get("x-real-ip") ??
          null;
        const result = await ingestSyslogPost({
          pathToken: String(params.token || ""),
          authorization: request.headers.get("authorization"),
          rawText,
          contentType: request.headers.get("content-type") ?? "",
          clientIp,
          db: createSupabaseSyslogIngestDb(supabaseAdmin as never),
        });
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { "content-type": "application/json" },
        });
      },
      GET: async () => new Response(null, { status: 405, headers: { allow: "POST" } }),
    },
  },
});
