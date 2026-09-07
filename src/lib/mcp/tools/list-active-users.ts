import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, loadRouterConn, unauth } from "../supabase-user";

export default defineTool({
  name: "list_active_hotspot_users",
  title: "List active hotspot users",
  description:
    "Fetch the live list of active hotspot sessions on the given router (IP, MAC, user, uptime, bytes).",
  inputSchema: {
    router_id: z.string().uuid().describe("Router ID from list_routers."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async ({ router_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    try {
      const { routerAPI } = await import("@/lib/mikrotik.server");
      const conn = await loadRouterConn(ctx, router_id);
      const active = await routerAPI.activeUsers(conn);
      return jsonResult(active);
    } catch (e) {
      return errorResult(e);
    }
  },
});
