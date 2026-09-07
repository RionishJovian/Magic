// Read-only aggregate reachability check over the signed-in user's physical
// routers. Deliberately returns COUNTS ONLY — no router IDs, names, hosts,
// errors, or any per-router detail may ever appear in the output.
import { defineTool } from "@lovable.dev/mcp-js";
import { jsonResult, loadRouterConn, supabaseForMcpUser, unauth } from "../supabase-user";

type ReachabilityStatus = "reachable" | "unreachable" | "mixed" | "no_registered_routers";

export default defineTool({
  name: "get_router_reachability",
  title: "Get router reachability",
  description:
    "Aggregate reachability check across the signed-in user's registered physical routers. Returns counts only (total, reachable, unreachable, status) — never router details.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauth();
    try {
      const sb = supabaseForMcpUser(ctx);
      const { data, error } = await sb
        .from("router_connections")
        .select("id, is_virtual, connection_mode");
      if (error) throw error;
      const { filterPhysicalRouters } = await import("../../test-router");
      const physical = filterPhysicalRouters(data ?? []);
      if (physical.length === 0) {
        return jsonResult({
          total: 0,
          reachable: 0,
          unreachable: 0,
          status: "no_registered_routers" satisfies ReachabilityStatus,
        });
      }

      const { routerAPI } = await import("@/lib/mikrotik.server");
      // Same no-write status path as routersStatus: load connection, ping only.
      // Every per-router failure is suppressed into the unreachable count.
      const outcomes = await Promise.all(
        physical.map(async (row) => {
          try {
            const conn = await loadRouterConn(ctx, row.id);
            await routerAPI.ping(conn);
            return true;
          } catch {
            return false;
          }
        }),
      );

      const reachable = outcomes.filter(Boolean).length;
      const unreachable = physical.length - reachable;
      const status: ReachabilityStatus =
        reachable === physical.length ? "reachable" : reachable === 0 ? "unreachable" : "mixed";
      return jsonResult({ total: physical.length, reachable, unreachable, status });
    } catch {
      // Fixed generic error — never leak exception text over MCP.
      return {
        content: [
          { type: "text" as const, text: "Router reachability check is temporarily unavailable." },
        ],
        isError: true as const,
      };
    }
  },
});
