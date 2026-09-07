import { createFileRoute } from "@tanstack/react-router";
import SCRIPT from "@/agent/install/windows-install.ps1?raw";

/** One-line Windows install script: irm <url> | iex */
export const Route = createFileRoute("/api/public/connector/install/windows")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SCRIPT, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
