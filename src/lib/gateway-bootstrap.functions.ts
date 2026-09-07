import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
const intent = z.object({
  kind: z.literal("gateway-bootstrap"),
  routerId: z.string().uuid(),
  wanInterface: z.string().min(1).max(64),
  strategy: z.enum(["existing-bridge", "new-bridge", "vlan"]),
  bridge: z.string().min(1).max(64),
  vlanId: z.number().int().min(1).max(4094).optional(),
  gatewayCidr: z.string().max(32),
  dhcpRange: z.string().max(64),
  guestPorts: z.array(z.string().max(64)).max(16),
  dnsServers: z.array(z.string().max(64)).max(4),
});
const apply = intent.extend({
  typedApply: z.literal("APPLY"),
  reviewedIntentHash: z
    .string()
    .regex(/^[a-f0-9]+$/)
    .max(128),
});
const transport = async (s: unknown) =>
  (await import("./gateway-bootstrap/engine.server")).createGatewayTransport(s as never);
export const inspectGatewayBootstrap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ routerId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    return (await transport(context.supabase)).discover(data.routerId);
  });
export const planGatewayBootstrapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => intent.parse(x))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const result = (await import("./gateway-bootstrap/planner")).planGatewayBootstrap(
      data,
      await (await transport(context.supabase)).discover(data.routerId),
    );
    await (
      await import("./audit.server")
    ).recordRouterOp({
      userId: context.userId,
      routerId: data.routerId,
      action: "gateway_bootstrap_preview",
      outcome: result.blocked ? "blocked" : "ok",
      detail: result.blocked
        ? "Gateway bootstrap dry run blocked."
        : "Gateway bootstrap dry run completed.",
    });
    return result;
  });
export const applyGatewayBootstrapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => apply.parse(x))
  .handler(async ({ data, context }) => {
    const g = await import("./guards.server");
    await g.requireNotExpired(context.supabase, context.userId);
    await g.requireFeature(context.supabase, context.userId, "router_config");
    const result = await (
      await import("./gateway-bootstrap/engine.server")
    ).applyGatewayBootstrap(await transport(context.supabase), data);
    await (
      await import("./audit.server")
    ).recordRouterOp({
      userId: context.userId,
      routerId: data.routerId,
      action: "gateway_bootstrap_result",
      outcome: result.outcome.ok ? "ok" : "failed",
      detail: result.outcome.ok ? "Gateway bootstrap applied." : "Gateway bootstrap failed.",
      error: result.outcome.error,
    });
    return result;
  });
