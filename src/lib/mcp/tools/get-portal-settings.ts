import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, jsonResult, supabaseForMcpUser, unauth } from "../supabase-user";

export default defineTool({
  name: "get_portal_settings",
  title: "Get captive portal settings",
  description: "Read the signed-in user's liquid-glass captive portal configuration.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    try {
      const sb = supabaseForMcpUser(ctx);
      const { data, error } = await sb.from("portal_settings").select("*").maybeSingle();
      if (error) throw new Error(error.message);
      return jsonResult(data ?? null);
    } catch (e) {
      return errorResult(e);
    }
  },
});
