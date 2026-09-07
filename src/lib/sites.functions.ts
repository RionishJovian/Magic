import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeSiteCoords } from "./sites-coords";
import { toErrorMessage } from "./error-message";
import type { PlatformActiveSiteRow, PlatformRouterActivity } from "./platform-active-sites";

const coordNumber = (min: number, max: number) =>
  z.preprocess((value) => {
    if (value == null || value === "") return null;
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return value;
  }, z.number().min(min).max(max).nullable().optional());

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  location: z.string().max(200).optional().nullable(),
  timezone: z
    .string()
    .max(80)
    .optional()
    .nullable()
    .refine(
      (v) => v == null || v === "" || /^[A-Za-z0-9_+\-/]+$/.test(v.trim()),
      "Timezone must look like Asia/Yangon (IANA).",
    ),
  notes: z.string().max(2000).optional().nullable(),
  latitude: coordNumber(-90, 90),
  longitude: coordNumber(-180, 180),
});

export const listSites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    // Defense in depth: always filter by effective_owner. Do not rely on Sites RLS alone —
    // legacy policies used global has_role(..., 'owner') and leaked every tenant's names.
    const { data: ownerRow, error: ownerErr } = await context.supabase.rpc("effective_owner", {
      _user_id: context.userId,
    });
    if (ownerErr) throw new Error(ownerErr.message);
    const ownerId = (ownerRow as string | null) ?? context.userId;
    const { data, error } = await context.supabase
      .from("sites")
      .select("id, owner_id, name, location, timezone, notes, latitude, longitude, created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    // Postgres `numeric` arrives as strings from PostgREST — normalize for the map.
    return (data ?? []).map(normalizeSiteCoords);
  });

export const saveSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const parsed = upsertSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(toErrorMessage(parsed.error, "Invalid site details"));
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { data: ownerRow, error: ownerErr } = await context.supabase.rpc("effective_owner", {
      _user_id: context.userId,
    });
    if (ownerErr) throw new Error(ownerErr.message);
    const ownerId = (ownerRow as string | null) ?? context.userId;

    const patch = {
      name: data.name,
      location: data.location ?? null,
      timezone: data.timezone ?? null,
      notes: data.notes ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    };

    if (data.id) {
      const { assertSiteOwnedByTenant } = await import("./sites-ownership.server");
      await assertSiteOwnedByTenant(context.supabase, ownerId, data.id);
      const { error } = await context.supabase.from("sites").update(patch).eq("id", data.id);
      if (error) throw new Error(toErrorMessage(error, "Could not update site"));
      return { id: data.id };
    }
    const guards = await import("./guards.server");
    {
      await guards.requireNotExpired(context.supabase, context.userId);
      // Sites RLS insert checks owner_id = effective_owner(auth.uid()) and refuses
      // read-only staff. Explain both up front instead of surfacing a raw RLS error.
      if ((ownerRow as string | null) == null) {
        throw new Error(
          "Your account isn't linked to a café yet, so sites can't be created. Ask the café Primary (or support) to attach your account, then try again.",
        );
      }
      const roles = await guards.getRoles(context.supabase, context.userId);
      if (roles.includes("read_only")) {
        throw new Error("Your account is read-only, so it can't create sites.");
      }
      const dup = await guards.findDuplicate(context.supabase, ownerId, "sites", {
        name: data.name,
      });
      if (dup) return { id: dup, deduped: true as const };
      await guards.enforceDeviceQuota(context.supabase, context.userId, "sites");
    }
    const { data: inserted, error } = await context.supabase
      .from("sites")
      .insert({ owner_id: ownerId, ...patch })
      .select("id")
      .single();
    if (error) throw guards.friendlyDeviceError(error, "sites");
    return { id: inserted.id };
  });

export const deleteSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        confirmation: z.string().max(80).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const routers = await context.supabase
      .from("router_connections")
      .select("id", { count: "exact", head: true })
      .eq("site_id", data.id);
    const devices = await context.supabase
      .from("managed_devices")
      .select("id", { count: "exact", head: true })
      .eq("site_id", data.id);
    const bound = (routers.count ?? 0) + (devices.count ?? 0);
    const { siteNeedsTypedDeletion, assertTypedConfirmation, DELETE_SITE_PHRASE } =
      await import("./device-removal");
    if (siteNeedsTypedDeletion(bound)) {
      assertTypedConfirmation(data.confirmation, DELETE_SITE_PHRASE);
    }

    const { data: ownerRow, error: ownerErr } = await context.supabase.rpc("effective_owner", {
      _user_id: context.userId,
    });
    if (ownerErr) throw new Error(ownerErr.message);
    const ownerId = (ownerRow as string | null) ?? context.userId;
    const { assertSiteOwnedByTenant } = await import("./sites-ownership.server");
    await assertSiteOwnedByTenant(context.supabase, ownerId, data.id);

    const { error } = await context.supabase
      .from("sites")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignRouterToSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        routerId: z.string().uuid(),
        siteId: z.string().uuid().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: ownerRow, error: ownerErr } = await context.supabase.rpc("effective_owner", {
      _user_id: context.userId,
    });
    if (ownerErr) throw new Error(ownerErr.message);
    const ownerId = (ownerRow as string | null) ?? context.userId;
    const { assertSiteOwnedByTenant } = await import("./sites-ownership.server");
    const siteId = await assertSiteOwnedByTenant(context.supabase, ownerId, data.siteId);

    const { data: router, error: routerErr } = await context.supabase
      .from("router_connections")
      .select("id")
      .eq("id", data.routerId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (routerErr) throw new Error(routerErr.message);
    if (!router) throw new Error("Router not found on your account.");

    const { error } = await context.supabase
      .from("router_connections")
      .update({ site_id: siteId })
      .eq("id", data.routerId)
      .eq("owner_id", ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRoutersWithSite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ownerRow, error: ownerErr } = await context.supabase.rpc("effective_owner", {
      _user_id: context.userId,
    });
    if (ownerErr) throw new Error(ownerErr.message);
    const ownerId = (ownerRow as string | null) ?? context.userId;
    const { data, error } = await context.supabase
      .from("router_connections")
      .select("id, name, host, site_id, connection_mode, is_virtual")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { filterPhysicalRouters } = await import("./test-router");
    return filterPhysicalRouters(data ?? []);
  });

/**
 * Platform Support sites that have physical routers, with a live/recent online
 * signal. Developers see all supported tenants; Primaries see only eligible
 * customer accounts and never another Primary tenant. Tenant listSites remains
 * isolated to the effective owner.
 */
export const listPlatformActiveSites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveAdminScope, tenantUserIdSet } = await import("./admin-scope.server");
    const scope = await resolveAdminScope(context);
    const allowedOwnerIds = await tenantUserIdSet(scope);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { filterPhysicalRouters } = await import("./test-router");
    const { isRouterConnectionActive } = await import("./platform-active-sites");

    const [{ data: routers, error: routersErr }, { data: sites, error: sitesErr }] =
      await Promise.all([
        supabaseAdmin
          .from("router_connections")
          .select(
            "id, name, owner_id, site_id, connection_mode, is_virtual, cloud_status, cloud_last_handshake_at, cloud_last_seen_at",
          )
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("sites")
          .select("id, owner_id, name, location, timezone, latitude, longitude"),
      ]);
    if (routersErr) throw new Error(routersErr.message);
    if (sitesErr) throw new Error(sitesErr.message);

    type SiteRow = {
      id: string;
      owner_id: string;
      name: string;
      location: string | null;
      timezone: string | null;
      latitude: number | string | null;
      longitude: number | string | null;
    };
    const physical = filterPhysicalRouters(routers ?? []).filter(
      (router) =>
        router.owner_id !== scope.tenantId &&
        (!allowedOwnerIds || allowedOwnerIds.has(router.owner_id)),
    );
    const siteById = new Map<string, SiteRow>((sites ?? []).map((s) => [s.id, s as SiteRow]));
    const nowMs = Date.now();

    type Bucket = {
      siteId: string | null;
      ownerId: string;
      site: SiteRow | null;
      routers: PlatformRouterActivity[];
    };
    const buckets = new Map<string, Bucket>();

    for (const r of physical) {
      const siteId = r.site_id ?? null;
      const ownerId = r.owner_id;
      const key = siteId ? `site:${siteId}` : `unassigned:${ownerId}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          siteId,
          ownerId,
          site: siteId ? (siteById.get(siteId) ?? null) : null,
          routers: [],
        };
        buckets.set(key, bucket);
      }
      bucket.routers.push({
        id: r.id,
        name: r.name,
        connectionMode: r.connection_mode,
        cloudStatus: r.cloud_status ?? "pending",
        lastHandshakeAt: r.cloud_last_handshake_at ?? null,
        lastSeenAt: r.cloud_last_seen_at ?? null,
        active: isRouterConnectionActive(r, nowMs),
      });
    }

    const ownerIds = [...new Set([...buckets.values()].map((b) => b.ownerId))];
    const ownerEmail = new Map<string, string | null>();
    const ownerProfile = new Map<
      string,
      { display_name: string | null; username: string | null }
    >();

    if (ownerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, username, display_name")
        .in("id", ownerIds);
      for (const p of profiles ?? []) {
        ownerProfile.set(p.id, {
          display_name: p.display_name ?? null,
          username: p.username ?? null,
        });
      }
      await Promise.all(
        ownerIds.map(async (id) => {
          const { data } = await supabaseAdmin.auth.admin.getUserById(id);
          ownerEmail.set(id, data.user?.email ?? null);
        }),
      );
    }

    const rows: PlatformActiveSiteRow[] = [];
    for (const bucket of buckets.values()) {
      const activeRouterCount = bucket.routers.filter((x) => x.active).length;
      const profile = ownerProfile.get(bucket.ownerId);
      const site = bucket.site;
      rows.push({
        siteId: bucket.siteId,
        siteName: site?.name ?? (bucket.siteId ? "Unknown site" : "Unassigned routers"),
        location: site?.location ?? null,
        timezone: site?.timezone ?? null,
        latitude: site?.latitude != null ? Number(site.latitude) : null,
        longitude: site?.longitude != null ? Number(site.longitude) : null,
        ownerId: bucket.ownerId,
        ownerEmail: ownerEmail.get(bucket.ownerId) ?? null,
        ownerDisplayName: profile?.display_name ?? null,
        ownerUsername: profile?.username ?? null,
        routers: bucket.routers,
        routerCount: bucket.routers.length,
        activeRouterCount,
      });
    }

    rows.sort((a, b) => {
      if (b.activeRouterCount !== a.activeRouterCount) {
        return b.activeRouterCount - a.activeRouterCount;
      }
      return a.siteName.localeCompare(b.siteName);
    });
    const activeRouterCount = physical.filter((router) =>
      isRouterConnectionActive(router, nowMs),
    ).length;
    return {
      totalRouterCount: physical.length,
      activeRouterCount,
      offlineRouterCount: physical.length - activeRouterCount,
      totalSiteCount: rows.length,
      activeSiteCount: rows.filter((row) => row.activeRouterCount > 0).length,
      sites: rows,
    };
  });
