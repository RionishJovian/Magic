import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/$chat")({
  server: {
    handlers: {
      POST: async () => Response.json({ answer: "System booting..." }),
    },
  },
});
