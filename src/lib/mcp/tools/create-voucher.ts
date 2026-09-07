import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { DEFAULT_TRIAL_PROTECTED_MESSAGE, isDefaultTrialUser } from "@/lib/hotspot-voucher-users";
import { errorResult, jsonResult, loadRouterConn, unauth } from "../supabase-user";

export default defineTool({
  name: "create_voucher",
  title: "Create hotspot voucher",
  description: "Create a single hotspot user (voucher) on the router.",
  inputSchema: {
    router_id: z.string().uuid(),
    name: z.string().min(3).max(40).describe("Voucher code / login name."),
    profile: z.string().min(1).max(60).describe("RouterOS hotspot user profile name."),
    comment: z.string().max(120).optional(),
  },
  annotations: { readOnlyHint: false, openWorldHint: true },
  handler: async ({ router_id, ...v }, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    try {
      if (isDefaultTrialUser(v.name)) {
        return errorResult(new Error(DEFAULT_TRIAL_PROTECTED_MESSAGE));
      }
      const { routerAPI } = await import("@/lib/mikrotik.server");
      const conn = await loadRouterConn(ctx, router_id);
      await routerAPI.addUser(conn, { ...v, password: v.name });
      return jsonResult({ ok: true, name: v.name });
    } catch (e) {
      return errorResult(e);
    }
  },
});
