import { createFileRoute } from "@tanstack/react-router";
import { AGENT_BUNDLE } from "@/lib/connector-agent-artifact";

/** Serves the current connector agent as a single self-contained file.
 *  Downloaded by installers and by the agent's own self-updater
 *  (checksum-pinned via /version, which hashes these exact bytes). */
export const Route = createFileRoute("/api/public/connector/download")({
  server: {
    handlers: {
      GET: async () =>
        new Response(AGENT_BUNDLE, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            "content-disposition": 'attachment; filename="connector-agent.mjs"',
            "cache-control": "no-store",
          },
        }),
    },
  },
});
