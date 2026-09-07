import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, loadRouterConn, unauth } from "../supabase-user";

export default defineTool({
  name: "kick_hotspot_user",
  title: "Kick hotspot user",
  description: "Disconnect an active hotspot session by its RouterOS ID.",
  inputSchema: {
    router_id: z.string().uuid(),
    active_id: z.string().min(1).describe('RouterOS ".id" of the active session.'),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  handler: async ({ router_id, active_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    try {
      const { routerAPI } = await import("@/lib/mikrotik.server");
      const conn = await loadRouterConn(ctx, router_id);
      await routerAPI.removeActive(conn, active_id);
      return jsonResult({ ok: true });
    } catch (e) {
      return errorResult(e);
    }
  },
});
