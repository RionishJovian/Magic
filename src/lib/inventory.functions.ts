import { createServerFn } from "@tanstack/react-start";
import type { DatabaseClient } from "./database.types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Unified multi-vendor device inventory: MikroTik routers and switches,
// Ruijie, Cisco, TP-Link and UniFi gear in one list, each with an explicit
// capability set. Reads are open to any non-expired member; writes and any
// port power action are owner/admin only, confirmed and audited.

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  vendor: z.enum(["mikrotik", "ruijie", "cisco", "tplink", "ubiquiti", "generic"]),
  category: z.enum(["router", "gateway", "switch", "ap", "controller"]),
  transport: z.enum(["direct", "connector", "controller"]),
  model: z.string().max(80).nullable().optional(),
  mac: z.string().max(32).nullable().optional(),
  host: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  routerId: z.string().uuid().nullable().optional(),
  controllerId: z.string().uuid().nullable().optional(),
  connectorId: z.string().uuid().nullable().optional(),
});

const descriptorSchema = upsertSchema.pick({ vendor: true, category: true, transport: true });

export const listManagedDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("managed_devices")
      .select(
        "id, name, vendor, category, transport, model, mac, host, location, notes, site_id, router_id, controller_id, connector_id, capabilities, created_at",
      )
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const { supportedActions } = await import("./devices/vendors");
    return (data ?? []).map((d: Record<string, unknown>) => ({
      ...d,
      capabilities: supportedActions({
        vendor: d["vendor"] as never,
        category: d["category"] as never,
        transport: d["transport"] as never,
      }),
    }));
  });

export const saveManagedDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => upsertSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    const ownerId = await guards.effectiveOwner(context.supabase, context.userId);
    const { supportedActions } = await import("./devices/vendors");

    const patch = {
      name: data.name,
      vendor: data.vendor,
      category: data.category,
      transport: data.transport,
      model: data.model ?? null,
      mac: data.mac ?? null,
      host: data.host ?? null,
      location: data.location ?? null,
      notes: data.notes ?? null,
      site_id: data.siteId ?? null,
      router_id: data.routerId ?? null,
      controller_id: data.controllerId ?? null,
      connector_id: data.connectorId ?? null,
      capabilities: supportedActions({
        vendor: data.vendor,
        category: data.category,
        transport: data.transport,
      }),
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("managed_devices")
        .update(patch)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    // Retry-safe: a rapid double submit resolves to the existing row.
    const { data: existing } = await context.supabase
      .from("managed_devices")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("name", data.name)
      .eq("category", data.category)
      .maybeSingle();
    if (existing?.id) return { id: existing.id as string, deduped: true as const };

    const { data: inserted, error } = await context.supabase
      .from("managed_devices")
      .insert({ ...patch, owner_id: ownerId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const deleteManagedDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    await guards.requireFeature(context.supabase, context.userId, "poe");
    const { error } = await context.supabase.from("managed_devices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

async function loadDevice(supabase: DatabaseClient, id: string) {
  const { data, error } = await supabase
    .from("managed_devices")
    .select("id, name, vendor, category, transport, router_id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Device not found.");
  return { ...data, ...descriptorSchema.parse(data) };
}

/** Live port / PoE view. Throws a plain-language reason when unsupported. */
export const readDevicePorts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ deviceId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const row = await loadDevice(context.supabase, data.deviceId);
    const { readPorts } = await import("./devices/drivers.server");
    return readPorts(
      { vendor: row.vendor, category: row.category, transport: row.transport },
      { supabase: context.supabase, routerId: row.router_id ?? null },
    );
  });

/** Safe PoE power-cycle: capability check, safety guard, typed confirmation, audit. */
export const cyclePoePort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        deviceId: z.string().uuid(),
        portRef: z.string().min(1).max(120),
        confirmation: z.string().min(1).max(120),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    await guards.requireFeature(context.supabase, context.userId, "poe");

    const row = await loadDevice(context.supabase, data.deviceId);
    const descriptor = {
      vendor: row.vendor,
      category: row.category,
      transport: row.transport,
    } as const;

    const { readPorts, cyclePoe } = await import("./devices/drivers.server");
    const { poeCycleGuard, checkPoeConfirmation } = await import("./devices/ports");

    const view = await readPorts(descriptor, {
      supabase: context.supabase,
      routerId: row.router_id ?? null,
    });
    const port = view.ports.find((p) => p.ref === data.portRef);
    if (!port) throw new Error("That port is no longer present on the device.");

    const guard = poeCycleGuard(descriptor, port);
    if (!guard.allowed) throw new Error(guard.reason);
    checkPoeConfirmation(port, data.confirmation);

    let ok = true;
    let message: string | null = null;
    try {
      await cyclePoe(
        descriptor,
        { supabase: context.supabase, routerId: row.router_id ?? null },
        port,
      );
    } catch (err) {
      ok = false;
      message = err instanceof Error ? err.message : String(err);
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("ap_actions_audit").insert({
        owner_id: row.owner_id,
        user_id: context.userId,
        brand: row.vendor,
        target: port.name,
        action: "poe_cycle",
        detail: { device_id: row.id, port_ref: port.ref },
        success: ok,
        error_message: message,
      });
    } catch (err) {
      console.error("[audit] poe cycle", err);
    }

    if (!ok) throw new Error(message ?? "Power-cycle failed.");
    return { ok: true as const };
  });
