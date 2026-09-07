import { createServerFn } from "@tanstack/react-start";
import type { DatabaseClient } from "./database.types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ConnectorSummary = {
  id: string;
  name: string;
  public_id: string;
  enabled: boolean;
  status: string;
  online: boolean;
  last_seen_at: string | null;
  version: string | null;
  local_ip: string | null;
  local_subnet: string | null;
  hostname: string | null;
  paired_at: string | null;
  created_at: string;
  routers: number;
  controllers: number;
};

const COLS =
  "id, name, public_id, enabled, status, last_seen_at, version, local_ip, local_subnet, hostname, paired_at, created_at";

export const listConnectors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ConnectorSummary[]> => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { isConnectorOnline } = await import("./connector.server");

    const { data, error } = await context.supabase
      .from("connectors")
      .select(COLS)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const ids = rows.map((r: { id: string }) => r.id);
    const counts = { routers: new Map<string, number>(), controllers: new Map<string, number>() };
    if (ids.length) {
      const [routers, controllers] = await Promise.all([
        context.supabase.from("router_connections").select("connector_id").in("connector_id", ids),
        context.supabase.from("unifi_controllers").select("connector_id").in("connector_id", ids),
      ]);
      for (const r of routers.data ?? [])
        if (r.connector_id)
          counts.routers.set(r.connector_id, (counts.routers.get(r.connector_id) ?? 0) + 1);
      for (const c of controllers.data ?? [])
        if (c.connector_id)
          counts.controllers.set(c.connector_id, (counts.controllers.get(c.connector_id) ?? 0) + 1);
    }

    return rows.map((r) => ({
      ...r,
      online: isConnectorOnline(r),
      routers: counts.routers.get(r.id) ?? 0,
      controllers: counts.controllers.get(r.id) ?? 0,
    }));
  });

/** Devices bound to one connector, for the detail list. */
export const listConnectorDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const [routers, controllers] = await Promise.all([
      context.supabase
        .from("router_connections")
        .select("id, name, host, port")
        .eq("connector_id", data.id),
      context.supabase
        .from("unifi_controllers")
        .select("id, name, host, port, brand")
        .eq("connector_id", data.id),
    ]);
    return {
      routers: (routers.data ?? []) as Array<{
        id: string;
        name: string;
        host: string;
        port: number;
      }>,
      controllers: (controllers.data ?? []) as Array<{
        id: string;
        name: string;
        host: string;
        port: number;
        brand: string;
      }>,
    };
  });

export type DiscoveredRouter = {
  id: string;
  connector_id: string;
  identity: string | null;
  model: string | null;
  os_version: string | null;
  ip: string | null;
  mac: string | null;
  serial: string | null;
  state: string;
  last_error: string | null;
  last_seen_at: string;
  backup_name: string | null;
  has_rollback: boolean;
};

/**
 * Routers the local connector discovered and, where bootstrap ran, set up.
 * Credentials are never returned — only whether a rollback script exists.
 */
export const listDiscoveredRouters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<DiscoveredRouter[]> => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("connector_discovered_routers")
      .select(
        "id, connector_id, identity, model, os_version, ip, mac, serial, state, last_error, last_seen_at, backup_name, rollback_script",
      )
      .eq("connector_id", data.id)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(({ rollback_script, ...r }) => ({
      ...r,
      has_rollback: Boolean(rollback_script),
    }));
  });

async function requireWrite(supabase: DatabaseClient, userId: string) {
  const guards = await import("./guards.server");
  await guards.requireNotExpired(supabase, userId);
  const roles = await guards.getRoles(supabase, userId);
  if (roles.includes("read_only"))
    throw new Error("Your account is read-only. Ask the app owner for management access.");
}

export const saveConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80) })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, context.userId);
    const { effectiveOwner } = await import("./guards.server");
    const { newPublicId } = await import("./connector.server");

    if (data.id) {
      const { error } = await context.supabase
        .from("connectors")
        .update({ name: data.name })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const ownerId = await effectiveOwner(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("connectors")
      .insert({ owner_id: ownerId, name: data.name, public_id: newPublicId() })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const setConnectorEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("connectors")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mint a fresh one-time pairing code. The plain code is shown once, here. */
export const generatePairingCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, context.userId);
    const { newPairingCode, hashToken } = await import("./connector.server");
    const code = newPairingCode();
    const expires = new Date(Date.now() + 30 * 60_000).toISOString();
    const { error } = await context.supabase
      .from("connectors")
      .update({
        pairing_code_hash: hashToken(code),
        pairing_code_expires_at: expires,
        // Minting a new code invalidates any previously paired agent token.
        token_hash: null,
        paired_at: null,
        status: "unpaired",
        last_seen_at: null,
        version: null,
        local_ip: null,
        local_subnet: null,
        hostname: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { code, expires_at: expires };
  });

export const unpairConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("connectors")
      .update({
        token_hash: null,
        paired_at: null,
        status: "unpaired",
        last_seen_at: null,
        version: null,
        local_ip: null,
        local_subnet: null,
        hostname: null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireWrite(context.supabase, context.userId);
    const { error } = await context.supabase.from("connectors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Round-trip check: is the connector connected and answering jobs right now? */
export const testConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("connectors")
      .select("id, name, enabled, status, last_seen_at, token_hash")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: false, error: "Connector not found." };
    if (!row.token_hash)
      return { ok: false, error: "Not paired yet — run the pairing code on the local connector." };
    if (!row.enabled) return { ok: false, error: "This connector is disabled." };

    const { isConnectorOnline } = await import("./connector.server");
    if (!isConnectorOnline(row))
      return {
        ok: false,
        error: "Connector offline — it is not currently connected to the cloud.",
      };

    const started = Date.now();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: job } = await supabaseAdmin
        .from("connector_jobs")
        .insert({
          connector_id: row.id,
          owner_id: (await (
            await import("./guards.server")
          ).effectiveOwner(context.supabase, context.userId)) as string,
          kind: "ping",
          request: { kind: "ping" },
          expires_at: new Date(Date.now() + 15_000).toISOString(),
        })
        .select("id")
        .single();
      if (!job) return { ok: false, error: "Could not queue the test job." };

      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400));
        const { data: check } = await supabaseAdmin
          .from("connector_jobs")
          .select("status, error")
          .eq("id", job.id)
          .maybeSingle();
        if (check?.status === "done") return { ok: true, ms: Date.now() - started, error: null };
        if (check?.status === "failed")
          return { ok: false, error: check.error ?? "Connector reported a failure." };
      }
      return { ok: false, error: "Connector did not answer the test in time." };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
