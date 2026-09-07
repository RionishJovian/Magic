// Brand-agnostic access point management server functions.
// Replaces the UniFi-only surface in unifi.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import type { DatabaseClient } from "./database.types";
import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { AP_BRANDS, type ApBrand, type ApCapability, type ApConn } from "./ap/types";

const macSchema = z
  .string()
  .regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, "Invalid MAC address");

const idOnly = z.object({ id: z.string().uuid() });
const routerIdOnly = z.object({ routerId: z.string().uuid() });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  brand: z.enum(AP_BRANDS).default("unifi"),
  name: z.string().min(1).max(80),
  host: z.string().min(1).max(200),
  port: z.number().int().min(1).max(65535).default(443),
  unifi_site: z.string().min(1).max(80).default("default"),
  username: z.string().min(1).max(120),
  password: z.string().min(0).max(200),
  is_unifi_os: z.boolean().default(true),
  allow_insecure_tls: z.boolean().default(true),
  api_base_path: z.string().max(120).nullable().optional(),
  router_id: z.string().uuid().nullable().optional(),
  site_id: z.string().uuid().nullable().optional(),
  connector_id: z.string().uuid().nullable().optional(),
});

const CONTROLLER_COLS =
  "id, brand, name, host, port, unifi_site, username, is_unifi_os, allow_insecure_tls, api_base_path, router_id, site_id, capabilities, created_at, connector_id";

async function loadConn(supabase: DatabaseClient, id: string): Promise<ApConn> {
  const { data, error } = await supabase
    .from("unifi_controllers")
    .select(
      "id, brand, host, port, username, password_ciphertext, unifi_site, is_unifi_os, allow_insecure_tls, api_base_path, router_id, connector_id",
    )
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Access point controller not found");
  const { decryptSecret } = await import("./crypto.server");
  const conn: ApConn = {
    id: data.id,
    brand: (data.brand ?? "unifi") as ApBrand,
    host: data.host,
    port: data.port,
    username: data.username,
    password: data.password_ciphertext ? decryptSecret(data.password_ciphertext) : "",
    site: data.unifi_site,
    isUnifiOs: data.is_unifi_os,
    allowInsecureTls: data.allow_insecure_tls,
    apiBasePath: data.api_base_path,
    connectorId: data.connector_id ?? null,
  };
  if (conn.brand === "mikrotik" && data.router_id) {
    const { loadRouterConn } = await import("./router-conn.server");
    conn.routerConn = await loadRouterConn(supabase, data.router_id);
  }
  return conn;
}

async function withDriver<T>(
  supabase: DatabaseClient,
  id: string,
  fn: (driver: import("./ap/types").ApDriver, conn: ApConn) => Promise<T>,
): Promise<T> {
  const conn = await loadConn(supabase, id);
  const { driverFor } = await import("./ap/registry.server");
  return fn(driverFor(conn.brand), conn);
}

/** Write guard: expired and read-only accounts may look but not change. */
async function requireWriteAccess(supabase: DatabaseClient, userId: string) {
  const guards = await import("./guards.server");
  await guards.requireNotExpired(supabase, userId);
  const roles = await guards.getRoles(supabase, userId);
  if (roles.includes("read_only"))
    throw new Error("Your account is read-only. Ask the app owner for management access.");
}

async function audit(
  supabase: DatabaseClient,
  userId: string,
  controllerId: string | null,
  brand: string,
  action: string,
  target: string | null,
  success: boolean,
  errorMessage: string | null,
  detail: Record<string, unknown> = {},
) {
  const { effectiveOwner } = await import("./guards.server");
  const ownerId = await effectiveOwner(supabase, userId);
  await supabase.from("ap_actions_audit").insert({
    owner_id: ownerId,
    user_id: userId,
    controller_id: controllerId,
    brand,
    action,
    target,
    success,
    error_message: errorMessage,
    detail: detail as Json,
  });
}

/** Runs a write action with the guard, driver dispatch and audit trail. */
async function runAction<T>(
  context: { supabase: DatabaseClient; userId: string },
  id: string,
  action: string,
  target: string | null,
  detail: Record<string, unknown>,
  fn: (driver: import("./ap/types").ApDriver, conn: ApConn) => Promise<T>,
): Promise<T> {
  await requireWriteAccess(context.supabase, context.userId);
  const conn = await loadConn(context.supabase, id);
  const { driverFor } = await import("./ap/registry.server");
  try {
    const out = await fn(driverFor(conn.brand), conn);
    await audit(
      context.supabase,
      context.userId,
      id,
      conn.brand,
      action,
      target,
      true,
      null,
      detail,
    );
    return out;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await audit(
      context.supabase,
      context.userId,
      id,
      conn.brand,
      action,
      target,
      false,
      message,
      detail,
    );
    throw new Error(message);
  }
}

/* ----------------------------- controllers ----------------------------- */

export const listApControllers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("unifi_controllers")
      .select(CONTROLLER_COLS)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c) => ({
      ...c,
      brand: (c.brand ?? "unifi") as ApBrand,
      capabilities: (Array.isArray(c.capabilities) ? c.capabilities : []) as ApCapability[],
    }));
  });

export const saveApController = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => upsertSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await requireWriteAccess(context.supabase, context.userId);
    const { encryptSecret } = await import("./crypto.server");
    const { effectiveOwner, enforceDeviceQuota } = await import("./guards.server");
    const ownerId = await effectiveOwner(context.supabase, context.userId);

    if (data.brand === "mikrotik" && !data.router_id)
      throw new Error("Choose which router manages these access points.");

    const password_ciphertext =
      data.password && data.password.length > 0 ? encryptSecret(data.password) : undefined;

    const base = {
      brand: data.brand,
      name: data.name,
      host: data.host,
      port: data.port,
      unifi_site: data.unifi_site,
      username: data.username,
      is_unifi_os: data.is_unifi_os,
      allow_insecure_tls: data.allow_insecure_tls,
      api_base_path: data.api_base_path ?? null,
      router_id: data.router_id ?? null,
      site_id: data.site_id ?? null,
      connector_id: data.connector_id ?? null,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("unifi_controllers")
        .update({ ...base, ...(password_ciphertext ? { password_ciphertext } : {}) })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    if (!password_ciphertext && data.brand !== "mikrotik")
      throw new Error("Password required on a new controller");

    // Double-submit / retry guard: identical controller already stored.
    const { findDuplicate, friendlyDeviceError } = await import("./guards.server");
    const dup = await findDuplicate(context.supabase, ownerId, "controllers", {
      name: data.name,
      host: data.host,
      port: data.port,
    });
    if (dup) return { id: dup };

    await enforceDeviceQuota(context.supabase, context.userId, "controllers");

    const { data: inserted, error } = await context.supabase
      .from("unifi_controllers")
      .insert({
        owner_id: ownerId,
        ...base,
        password_ciphertext: password_ciphertext ?? encryptSecret("-"),
      })
      .select("id")
      .single();
    if (error) throw friendlyDeviceError(error, "controllers");
    return { id: inserted.id as string };
  });

export const deleteApController = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idOnly.parse(raw))
  .handler(async ({ data, context }) => {
    await requireWriteAccess(context.supabase, context.userId);
    const { error } = await context.supabase.from("unifi_controllers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Logs in, records which features this controller actually exposes. */
export const testApController = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idOnly.parse(raw))
  .handler(async ({ data, context }) => {
    try {
      const result = await withDriver(context.supabase, data.id, async (driver, conn) => {
        const probe = await driver.probe(conn);
        return { probe, brand: conn.brand };
      });
      const caps = result.probe.capabilities ?? [];
      if (result.probe.ok) {
        await context.supabase
          .from("unifi_controllers")
          .update({ capabilities: caps })
          .eq("id", data.id);
      }
      return {
        ok: result.probe.ok,
        error: result.probe.error ?? null,
        info: result.probe.info ?? null,
        capabilities: caps,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        info: null,
        capabilities: [] as ApCapability[],
      };
    }
  });

/* -------------------------------- reads -------------------------------- */

export const listAps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idOnly.parse(raw))
  .handler(async ({ data, context }) =>
    withDriver(context.supabase, data.id, (d, c) => d.listAps(c)),
  );

export const listApClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idOnly.parse(raw))
  .handler(async ({ data, context }) =>
    withDriver(context.supabase, data.id, (d, c) => d.listClients(c)),
  );

export const listApSsids = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idOnly.parse(raw))
  .handler(async ({ data, context }) =>
    withDriver(context.supabase, data.id, (d, c) => d.listSsids(c)),
  );

/**
 * Read enabled SSIDs from AP controllers explicitly linked to this router or
 * to the same site. Ethernet neighbor tables cannot reveal an unmanaged AP's
 * SSID, so this deliberately uses only configured, tenant-scoped controllers.
 */
export const scanConnectedApSsids = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => routerIdOnly.parse(raw))
  .handler(async ({ data, context }) => {
    const { data: router, error: routerError } = await context.supabase
      .from("router_connections")
      .select("id, site_id")
      .eq("id", data.routerId)
      .single();
    if (routerError || !router)
      throw new Error(routerError?.message ?? "Router not found or access denied");

    const { data: controllers, error: controllersError } = await context.supabase
      .from("unifi_controllers")
      .select("id, name, brand, router_id, site_id")
      .order("created_at", { ascending: true });
    if (controllersError) throw new Error(controllersError.message);

    const linked = (controllers ?? []).filter(
      (controller) =>
        controller.router_id === data.routerId ||
        (Boolean(router.site_id) && controller.site_id === router.site_id),
    );
    const scans = await Promise.all(
      linked.map(async (controller) => {
        try {
          const ssids = await withDriver(context.supabase, controller.id, (driver, conn) =>
            driver.listSsids(conn),
          );
          return {
            controllerId: controller.id,
            controllerName: controller.name,
            brand: (controller.brand ?? "generic") as ApBrand,
            ssids: ssids.filter((ssid) => ssid.enabled && ssid.name.trim()),
            error: null,
          };
        } catch (error) {
          return {
            controllerId: controller.id,
            controllerName: controller.name,
            brand: (controller.brand ?? "generic") as ApBrand,
            ssids: [],
            error: error instanceof Error ? error.message : "SSID scan failed",
          };
        }
      }),
    );

    const seen = new Set<string>();
    const ssids = scans.flatMap((scan) =>
      scan.ssids
        .filter((ssid) => {
          const key = ssid.name.trim().toLocaleLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((ssid) => ({
          name: ssid.name,
          hidden: ssid.hidden,
          controllerId: scan.controllerId,
          controllerName: scan.controllerName,
          brand: scan.brand,
        })),
    );

    return {
      ssids,
      controllersChecked: linked.length,
      failedControllers: scans.filter((scan) => scan.error).map((scan) => scan.controllerName),
    };
  });

export const listApRadios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idOnly.parse(raw))
  .handler(async ({ data, context }) =>
    withDriver(context.supabase, data.id, (d, c) => d.listRadios(c)),
  );

export const listApAlarms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idOnly.parse(raw))
  .handler(async ({ data, context }) =>
    withDriver(context.supabase, data.id, (d, c) => d.listAlarms(c)),
  );

export const listApTraffic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => idOnly.parse(raw))
  .handler(async ({ data, context }) =>
    withDriver(context.supabase, data.id, (d, c) => d.trafficStats(c)),
  );

/* ------------------------------- writes -------------------------------- */

export const saveApSsid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        ref: z.string().max(120).nullable().optional(),
        name: z.string().min(1).max(32),
        password: z.string().min(8).max(63).nullable().optional(),
        enabled: z.boolean().optional(),
        vlan: z.number().int().min(1).max(4094).nullable().optional(),
        hidden: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) =>
    runAction(
      context,
      data.id,
      data.ref ? "ssid.update" : "ssid.create",
      data.name,
      { vlan: data.vlan ?? null, enabled: data.enabled ?? true },
      (d, c) =>
        d.saveSsid(c, {
          ref: data.ref ?? null,
          name: data.name,
          password: data.password ?? null,
          enabled: data.enabled,
          vlan: data.vlan ?? null,
          hidden: data.hidden,
        }),
    ),
  );

export const setApSsidEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), ref: z.string().min(1), enabled: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) =>
    runAction(context, data.id, "ssid.enable", data.ref, { enabled: data.enabled }, (d, c) =>
      d.setSsidEnabled(c, data.ref, data.enabled),
    ),
  );

export const setApSsidPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        ref: z.string().min(1),
        password: z.string().min(8).max(63),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) =>
    // The password itself is never written to the audit trail.
    runAction(context, data.id, "ssid.password", data.ref, {}, (d, c) =>
      d.setSsidPassword(c, data.ref, data.password),
    ),
  );

export const setApSsidVlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        ref: z.string().min(1),
        vlan: z.number().int().min(1).max(4094).nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) =>
    runAction(context, data.id, "ssid.vlan", data.ref, { vlan: data.vlan }, (d, c) =>
      d.setSsidVlan(c, data.ref, data.vlan),
    ),
  );

export const setApRadio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        ref: z.string().min(1),
        channel: z.string().max(20).nullable().optional(),
        width: z.string().max(20).nullable().optional(),
        tx_power: z.string().max(20).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) =>
    runAction(
      context,
      data.id,
      "radio.update",
      data.ref,
      { channel: data.channel ?? null, width: data.width ?? null, tx_power: data.tx_power ?? null },
      (d, c) =>
        d.setRadio(c, {
          ref: data.ref,
          channel: data.channel ?? null,
          width: data.width ?? null,
          tx_power: data.tx_power ?? null,
        }),
    ),
  );

export const rebootAp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), ref: z.string().min(1), mac: macSchema }).parse(raw),
  )
  .handler(async ({ data, context }) =>
    runAction(context, data.id, "ap.reboot", data.mac, {}, (d, c) =>
      d.rebootAp(c, data.ref, data.mac),
    ),
  );

export const apClientAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        mac: macSchema,
        action: z.enum(["block", "unblock", "reconnect"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) =>
    runAction(context, data.id, `client.${data.action}`, data.mac, {}, (d, c) =>
      d.clientAction(c, data.mac, data.action),
    ),
  );

/* --------------------------- AP metadata cache -------------------------- */

/** Stores the friendly name / location an operator sets for a physical AP. */
export const saveApMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        controller_id: z.string().uuid(),
        mac: macSchema,
        name: z.string().max(80).nullable().optional(),
        location: z.string().max(120).nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await requireWriteAccess(context.supabase, context.userId);
    const { effectiveOwner } = await import("./guards.server");
    const ownerId = await effectiveOwner(context.supabase, context.userId);
    const { error } = await context.supabase.from("ap_devices").upsert(
      {
        owner_id: ownerId,
        controller_id: data.controller_id,
        mac: data.mac,
        name: data.name ?? null,
        location: data.location ?? null,
        notes: data.notes ?? null,
      },
      { onConflict: "controller_id,mac" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listApMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ controller_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ap_devices")
      .select("mac, name, location, notes")
      .eq("controller_id", data.controller_id);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
