import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Staged test-router workflow: read-only connection checks, environment
// marking (test vs production), guarded promotion, and the operations audit
// feed. No write operation against a router is performed here.

const ROUTER_SELECT =
  "id, name, host, port, environment, owner_id, use_tls, allow_insecure_tls, connector_id, connection_mode";

// The Supabase client handed to the handler by requireSupabaseAuth.
type RouterDb = SupabaseClient<Database>;

async function loadRouterRow(supabase: RouterDb, routerId: string) {
  const { data, error } = await supabase
    .from("router_connections")
    .select(ROUTER_SELECT)
    .eq("id", routerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Router not found.");
  return data as {
    id: string;
    name: string;
    host: string;
    port: number;
    environment: string | null;
    owner_id: string;
    use_tls: boolean;
    allow_insecure_tls: boolean;
    connector_id: string | null;
    connection_mode: string | null;
  };
}

/** Read-only: validates the endpoint, then asks the router who it is. */
export const checkRouterConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    const { recordRouterOp } = await import("./audit.server");
    const row = await loadRouterRow(context.supabase, data.routerId);
    const environment = (row.environment ?? "production") as "test" | "production";
    const started = Date.now();
    const { assertNotVirtualRouter } = await import("./test-router");
    assertNotVirtualRouter(row, "run a connection check");
    await guards.requirePrivileged(context.supabase, context.userId);

    try {
      if (row.connection_mode === "hub" || row.connection_mode === "cloud") {
        // Magic Hub host is a label (often CGNAT). Never treat it as a public dial.
      } else if (row.connector_id) {
        const { assertConnectorLanEndpoint } = await import("./connector-guard.server");
        assertConnectorLanEndpoint(row.host, row.port);
      } else {
        const { assertSafeEndpoint } = await import("./net/endpoint.server");
        await assertSafeEndpoint(row.host, row.port);
      }
    } catch (e) {
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "endpoint_validation_failed",
        environment,
        outcome: "blocked",
        error: e,
        durationMs: Date.now() - started,
      });
      throw e instanceof Error ? e : new Error(String(e));
    }

    try {
      const { loadRouterConn } = await import("./router-conn.server");
      const { routerAPI } = await import("./mikrotik.server");
      const conn = await loadRouterConn(context.supabase, row.id);
      const info = (await routerAPI.ping(conn)) as { version?: string; "board-name"?: string };
      const identity = await routerAPI
        .raw<{ name?: string }>(conn, "/system/identity")
        .catch(() => null);
      const durationMs = Date.now() - started;
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "connection_check",
        environment,
        outcome: "ok",
        detail: `RouterOS ${info?.version ?? "?"} (${info?.["board-name"] ?? "unknown board"})`,
        durationMs,
      });
      return {
        ok: true as const,
        environment,
        version: info?.version ?? null,
        board: info?.["board-name"] ?? null,
        identity: identity?.name ?? null,
        durationMs,
      };
    } catch (e) {
      const durationMs = Date.now() - started;
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "connection_check",
        environment,
        outcome: "failed",
        error: e,
        durationMs,
      });
      return {
        ok: false as const,
        environment,
        error: e instanceof Error ? e.message : String(e),
        durationMs,
      };
    }
  });

/**
 * Mark a router as test or production. Promotion to production needs a
 * privileged role plus a typed confirmation; both outcomes are audited.
 */
export const setRouterEnvironment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        environment: z.enum(["test", "production"]),
        confirmation: z.string().max(200).default(""),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    const { recordRouterOp } = await import("./audit.server");
    const gates = await import("./test-router");
    const row = await loadRouterRow(context.supabase, data.routerId);

    gates.assertNotVirtualRouter(row, "be promoted or demoted");

    const action = data.environment === "production" ? "promote" : "demote";
    const expected = gates.expectedConfirmation(action, data.environment, row.name);
    try {
      if (data.environment === "production")
        await guards.requirePrivileged(context.supabase, context.userId);
      gates.assertConfirmation(data.confirmation, expected);
    } catch (e) {
      await recordRouterOp({
        userId: context.userId,
        ownerId: row.owner_id,
        routerId: row.id,
        routerName: row.name,
        action: "confirmation_failed",
        environment: data.environment,
        outcome: "blocked",
        detail: `expected "${expected}"`,
        error: e,
      });
      throw e instanceof Error ? e : new Error(String(e));
    }

    const { error } = await context.supabase
      .from("router_connections")
      .update({ environment: data.environment })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    await recordRouterOp({
      userId: context.userId,
      ownerId: row.owner_id,
      routerId: row.id,
      routerName: row.name,
      action: data.environment === "production" ? "test_router_promoted" : "test_router_demoted",
      environment: data.environment,
      outcome: "ok",
      detail: `confirmed as "${expected}"`,
    });
    return { ok: true, environment: data.environment };
  });

/**
 * Privileged, per-router, explicitly recorded exception that allows a
 * self-signed certificate on one router. TLS stays verified everywhere else.
 */
export const setInsecureTlsException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        allow: z.boolean(),
        reason: z.string().max(300).default(""),
        confirmation: z.string().max(200).default(""),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const guards = await import("./guards.server");
    await guards.requirePrivileged(context.supabase, context.userId);
    const { recordRouterOp } = await import("./audit.server");
    const gates = await import("./test-router");
    const row = await loadRouterRow(context.supabase, data.routerId);
    gates.assertNotVirtualRouter(row, "use a self-signed TLS exception");
    const environment = (row.environment ?? "production") as "test" | "production";

    if (data.allow) {
      const expected = gates.expectedConfirmation("insecure-tls", environment, row.name);
      if (!data.reason.trim())
        throw new Error("Give a reason for the self-signed certificate exception.");
      try {
        gates.assertConfirmation(data.confirmation, expected);
      } catch (e) {
        await recordRouterOp({
          userId: context.userId,
          ownerId: row.owner_id,
          routerId: row.id,
          routerName: row.name,
          action: "confirmation_failed",
          environment,
          outcome: "blocked",
          detail: `expected "${expected}"`,
          error: e,
        });
        throw e instanceof Error ? e : new Error(String(e));
      }
    }

    const { error } = await context.supabase
      .from("router_connections")
      .update({
        allow_insecure_tls: data.allow,
        insecure_tls_reason: data.allow ? data.reason.trim() : null,
        insecure_tls_approved_by: data.allow ? context.userId : null,
        insecure_tls_approved_at: data.allow ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);

    await recordRouterOp({
      userId: context.userId,
      ownerId: row.owner_id,
      routerId: row.id,
      routerName: row.name,
      action: "tls_exception_granted",
      environment,
      outcome: "ok",
      detail: data.allow ? `enabled: ${data.reason.trim()}` : "revoked",
    });
    return { ok: true, allowInsecureTls: data.allow };
  });

/** Routers split by environment, with a friendly empty state in the UI. */
export const listRoutersByEnvironment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const guards = await import("./guards.server");
    await guards.requirePrivileged(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("router_connections")
      .select(
        "id, name, host, port, environment, use_tls, allow_insecure_tls, insecure_tls_reason, connector_id, connection_mode, is_virtual, created_at",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    type Row = {
      id: string;
      name: string;
      host: string;
      port: number;
      environment: string | null;
      use_tls: boolean;
      allow_insecure_tls: boolean;
      insecure_tls_reason: string | null;
      connector_id: string | null;
      connection_mode: string | null;
      is_virtual?: boolean | null;
      created_at: string;
    };
    const { filterPhysicalRouters } = await import("./test-router");
    const hardware = filterPhysicalRouters((data ?? []) as Row[]);
    return {
      test: hardware.filter((r) => (r.environment ?? "production") === "test"),
      production: hardware.filter((r) => (r.environment ?? "production") !== "test"),
    };
  });

export { listRouterOpsAudit } from "./audit.functions";

/**
 * Whether this account may open the Test Lab (physical hardware / MCP policy).
 * Client, agent and expired accounts are refused — Primary or Developer only.
 */
export const getTestLabAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getRoles, isPrivilegedAccount, isPlatformAdminUser } = await import("./guards.server");
    const [roles, isPlatformAdmin] = await Promise.all([
      getRoles(context.supabase, context.userId),
      isPlatformAdminUser(context.supabase, context.userId),
    ]);
    return { allowed: isPrivilegedAccount(roles, isPlatformAdmin) };
  });
