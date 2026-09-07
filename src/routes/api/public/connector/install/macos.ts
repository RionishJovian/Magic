import { createFileRoute } from "@tanstack/react-router";
import SCRIPT from "@/agent/install/macos-install.sh?raw";

/** One-line macOS install script: curl -fsSL <url> | sudo bash -s CODE */
export const Route = createFileRoute("/api/public/connector/install/macos")({
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
