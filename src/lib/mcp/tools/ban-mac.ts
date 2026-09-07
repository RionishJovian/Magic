import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, loadRouterConn, unauth } from "../supabase-user";

export default defineTool({
  name: "ban_mac",
  title: "Ban a MAC address",
  description: "Add a blocked IP binding for a MAC address on the router's hotspot.",
  inputSchema: {
    router_id: z.string().uuid(),
    mac: z
      .string()
      .regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i)
      .describe("MAC address, e.g. AA:BB:CC:11:22:33"),
    comment: z.string().max(120).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  handler: async ({ router_id, mac, comment }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    try {
      const { routerAPI } = await import("@/lib/mikrotik.server");
      const conn = await loadRouterConn(ctx, router_id);
      await routerAPI.banMac(conn, mac, comment);
      return jsonResult({ ok: true });
    } catch (e) {
      return errorResult(e);
    }
  },
});
