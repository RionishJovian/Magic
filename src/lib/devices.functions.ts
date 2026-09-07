import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type DeviceKind = "routers" | "controllers" | "sites";

export type DeviceRequest = {
  id: string;
  owner_id: string;
  user_id: string;
  kind: string;
  reason: string | null;
  status: string;
  decided_at: string | null;
  created_at: string;
  requester: string;
};

/** Allowance + current usage for the caller's account. */
export const deviceLimits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const g = await import("./guards.server");
    const roles = await g.getRoles(context.supabase, context.userId);
    const isPlatformAdmin = await g.isPlatformAdminUser(context.supabase, context.userId);
    const privileged = g.isPrivilegedAccount(roles, isPlatformAdmin);
    const ownerId = await g.effectiveOwner(context.supabase, context.userId);
    const allow = await g.allowanceFor(context.supabase, ownerId);
    const [routers, controllers, sites] = await Promise.all([
      g.countFor(context.supabase, ownerId, "routers"),
      g.countFor(context.supabase, ownerId, "controllers"),
      g.countFor(context.supabase, ownerId, "sites"),
    ]);
    const { data: pending } = await context.supabase
      .from("device_requests")
      .select("id, kind, status, created_at")
      .eq("owner_id", ownerId)
      .eq("status", "pending");
    return {
      privileged,
      allow,
      used: { routers, controllers, sites },
      pending: (pending ?? []) as Array<{
        id: string;
        kind: string;
        status: string;
        created_at: string;
      }>,
    };
  });

export const requestDeviceSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        kind: z.enum(["routers", "controllers", "sites"]),
        reason: z.string().max(500).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const g = await import("./guards.server");
    const ownerId = await g.effectiveOwner(context.supabase, context.userId);
    const { data: existing } = await context.supabase
      .from("device_requests")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("kind", data.kind)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) return { id: existing.id, alreadyPending: true };
    const { data: row, error } = await context.supabase
      .from("device_requests")
      .insert({
        owner_id: ownerId,
        user_id: context.userId,
        kind: data.kind,
        reason: data.reason ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, alreadyPending: false };
  });

/** Owner/admin view of every pending or recently decided request. */
export const listDeviceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeviceRequest[]> => {
    const g = await import("./guards.server");
    await g.requirePrivileged(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("device_requests")
      .select("id, owner_id, user_id, kind, reason, status, decided_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as DeviceRequest[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const profilesRes = ids.length
      ? await context.supabase.from("profiles").select("id, display_name, username").in("id", ids)
      : { data: [] as Array<{ id: string; display_name: string | null; username: string | null }> };
    const byId = new Map(
      (
        (profilesRes.data ?? []) as Array<{
          id: string;
          display_name: string | null;
          username: string | null;
        }>
      ).map((p) => [p.id, p]),
    );
    return rows.map((r) => ({
      ...r,
      requester: byId.get(r.user_id)?.display_name ?? byId.get(r.user_id)?.username ?? r.user_id,
    }));
  });

export const decideDeviceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const g = await import("./guards.server");
    await g.requirePrivileged(context.supabase, context.userId);

    const { data: req, error: reqErr } = await context.supabase
      .from("device_requests")
      .select("id, owner_id, kind, status")
      .eq("id", data.id)
      .single();
    if (reqErr || !req) throw new Error(reqErr?.message ?? "Request not found");
    if (req.status !== "pending") return { ok: true, alreadyDecided: true };

    if (data.approve) {
      const allow = await g.allowanceFor(context.supabase, req.owner_id);
      const kind = req.kind as DeviceKind;
      const next = { ...allow, [kind]: (allow[kind] ?? 1) + 1 };
      const { error: upErr } = await context.supabase
        .from("device_allowances")
        .upsert({ owner_id: req.owner_id, ...next }, { onConflict: "owner_id" });
      if (upErr) throw new Error(upErr.message);
    }

    const { error } = await context.supabase
      .from("device_requests")
      .update({
        status: data.approve ? "approved" : "denied",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, alreadyDecided: false };
  });
