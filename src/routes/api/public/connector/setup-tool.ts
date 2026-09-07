import { createFileRoute } from "@tanstack/react-router";
import { SETUP_BUNDLE } from "@/lib/connector-setup-artifact";

/** Serves the local router setup tool as a single self-contained file.
 *  /version hashes exactly these bytes as `setupSha256`. */
export const Route = createFileRoute("/api/public/connector/setup-tool")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SETUP_BUNDLE, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            "content-disposition": 'attachment; filename="connector-setup.mjs"',
            "cache-control": "no-store",
          },
        }),
    },
  },
});
