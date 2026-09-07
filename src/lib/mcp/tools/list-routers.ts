import { defineTool } from "@lovable.dev/mcp-js";
import { errorResult, jsonResult, supabaseForMcpUser, unauth } from "../supabase-user";

export default defineTool({
  name: "list_routers",
  title: "List routers",
  description: "List MikroTik routers registered by the signed-in user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    try {
      const sb = supabaseForMcpUser(ctx);
      const { data, error } = await sb
        .from("router_connections")
        .select(
          "id, name, host, port, username, use_tls, is_default, created_at, is_virtual, connection_mode",
        )
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const { filterPhysicalRouters } = await import("../../test-router");
      return jsonResult(filterPhysicalRouters(data ?? []));
    } catch (e) {
      return errorResult(e);
    }
  },
});
