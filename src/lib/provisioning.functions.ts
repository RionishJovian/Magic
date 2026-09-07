import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Server functions for the provisioning engine. Planning is read-only and
// available to any non-expired member; apply is owner/admin only, requires a
// typed confirmation, and always takes a backup first.

const linkSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(24)
    .regex(/^[a-z0-9-]+$/),
  label: z.string().min(1).max(60),
  iface: z.string().min(1).max(60),
  provider: z.enum(["starlink", "fiber", "lte", "other"]),
  gateway: z.string().max(60).optional(),
  weight: z.number().int().min(1).max(8),
  healthCheckTarget: z.string().min(1).max(60),
  secondaryHealthCheckTarget: z.string().max(60).optional(),
  cgnat: z.boolean(),
  wantsInbound: z.boolean(),
  enabled: z.boolean(),
});

const intentSchema = z.object({
  kind: z.literal("multi-wan"),
  routerId: z.string().uuid(),
  mode: z.enum(["failover", "balance"]),
  links: z.array(linkSchema).min(1).max(8),
  policy: z.object({
    failThreshold: z.number().int().min(1).max(10),
    probeIntervalSec: z.number().int().min(5).max(300),
    holdDownSec: z.number().int().min(0).max(3600),
    autoFailback: z.boolean(),
  }),
  lanInterface: z.string().min(1).max(60),
  allowManagementPathChange: z.boolean(),
});

const planSchema = z.object({
  intent: intentSchema,
});

const applySchema = planSchema.extend({
  /** Must equal the router name — typed confirmation for a destructive action. */
  confirmation: z.string().min(1).max(120),
  /** Retry-safe: replaying the same key does not create a second history row. */
  idempotencyKey: z.string().min(8).max(120).optional(),
  /** Hash from the exact dry run the operator reviewed. */
  reviewedIntentHash: z.string().min(8).max(120),
});

async function transportFor(supabase: unknown) {
  const engine = await import("./provisioning/engine.server");
  return engine.createRouterOsTransport(supabase as never);
}

/** Read-only discovery: interfaces, OS capabilities and current managed rules. */
export const discoverRouterState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { createRouterOsTransport } = await import("./provisioning/engine.server");
    return createRouterOsTransport(context.supabase as never).discover(data.routerId);
  });

/** Plan + preflight. Never changes anything on the device. */
export const planProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => planSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { planIntent } = await import("./provisioning/engine.server");
    const transport = await transportFor(context.supabase);
    const { snapshot, plan } = await planIntent(transport, data.intent);
    return {
      plan,
      device: {
        identity: snapshot.identity,
        boardName: snapshot.boardName,
        version: snapshot.version,
        capabilities: snapshot.capabilities,
        interfaces: snapshot.interfaces,
        managementIface: snapshot.managementIface,
        publicAddress: snapshot.publicAddress,
        sandbox: snapshot.sandbox,
      },
    };
  });

/** Staged apply with backup, verification and automatic rollback. */
export const applyProvisioning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => applySchema.parse(raw))
  .handler(async ({ data, context }) => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    await guards.requireFeature(context.supabase, context.userId, "reboot");

    const { data: row } = await context.supabase
      .from("router_connections")
      .select("id, name, owner_id")
      .eq("id", data.intent.routerId)
      .maybeSingle();
    if (!row) throw new Error("Router not found.");
    if (data.confirmation.trim() !== row.name) {
      throw new Error(`Type the router name "${row.name}" exactly to confirm this change.`);
    }

    const { applyIntent } = await import("./provisioning/engine.server");
    const transport = await transportFor(context.supabase);
    const { plan, outcome } = await applyIntent(transport, data.intent, {
      reviewedIntentHash: data.reviewedIntentHash,
    });

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("router_save_audit").insert({
        user_id: context.userId,
        owner_id: row.owner_id ?? null,
        action: "provision_apply",
        router_id: row.id,
        attempted_name: row.name,
        attempted_host: null,
        success: outcome.ok,
        error_message: outcome.error ?? null,
        error_code: outcome.rolledBack ? "rolled_back" : null,
      });
    } catch (err) {
      console.error("[audit] provisioning apply", err);
    }

    // Deployment history: one durable row per apply, keyed so a retry of the
    // same request updates rather than duplicates.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const counts = plan.steps.reduce<Record<string, number>>((acc, s) => {
        acc[s.action] = (acc[s.action] ?? 0) + 1;
        return acc;
      }, {});
      await supabaseAdmin.from("deployment_history").upsert(
        {
          owner_id: row.owner_id ?? null,
          actor_user_id: context.userId,
          router_id: row.id,
          intent: data.intent.kind,
          mode: "apply",
          plan_hash: outcome.intentHash,
          idempotency_key: data.idempotencyKey ?? `${outcome.intentHash}:${Date.now()}`,
          diff_summary: { steps: plan.steps.length, byAction: counts },
          backup_ref: outcome.backup?.name ?? null,
          verification: { verified: outcome.verified, missingTags: outcome.missingTags },
          status: outcome.rolledBack
            ? "rolled_back"
            : !outcome.ok
              ? "failed"
              : outcome.verified
                ? "verified"
                : "applied",
          failure_reason: outcome.error ?? null,
          rolled_back_at: outcome.rolledBack ? new Date().toISOString() : null,
        },
        { onConflict: "owner_id,idempotency_key" },
      );
    } catch (err) {
      console.error("[deployment-history] provisioning apply", err);
    }

    return { plan, outcome };
  });
