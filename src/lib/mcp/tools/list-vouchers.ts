import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { sellableVoucherUsers } from "@/lib/hotspot-voucher-users";
import { errorResult, jsonResult, loadRouterConn, unauth } from "../supabase-user";

export default defineTool({
  name: "list_vouchers",
  title: "List hotspot vouchers",
  description: "List hotspot users (vouchers) configured on the router.",
  inputSchema: { router_id: z.string().uuid() },
  annotations: { readOnlyHint: true, openWorldHint: true },
  handler: async ({ router_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    try {
      const { routerAPI } = await import("@/lib/mikrotik.server");
      const conn = await loadRouterConn(ctx, router_id);
      const users = await routerAPI.users(conn);
      return jsonResult(sellableVoucherUsers(users ?? []));
    } catch (e) {
      return errorResult(e);
    }
  },
});
