import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireApiSupabaseAuth } from "@/lib/api-auth.server";
import { requireMagicDudeAccess } from "@/lib/magic-dude.functions";
import { handleMagicDudeChat } from "@/lib/magic-dude.server";

const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1).max(20),
  language: z.enum(["en", "my", "zh"]).optional(),
});

export const Route = createFileRoute("/api/$chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await requireApiSupabaseAuth(request);
          await requireMagicDudeAccess(auth);
          const body = bodySchema.parse(await request.json());
          const result = await handleMagicDudeChat(auth.supabase, auth.userId, body.messages, body.language);
          return Response.json(result);
        } catch (error: any) {
          return Response.json({ error: error.message || "Internal Error" }, { status: 500 });
        }
      },
    },
  },
});
