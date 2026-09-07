import { createServerFn } from "@tanstack/react-start";
import type { DatabaseClient } from "./database.types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { TENANT_PRIMARY_ROLE, hasTenantPrimaryRole } from "./app-role";
import { passwordSchema } from "./password-policy";

/** Tier Pass commission: Emerald monthly = 15, Sapphire annual = 150. */
export const TIER_PASS_POINTS = { monthly: 15, annual: 150, plus: 0 } as const;

async function rolesOf(ctx: { supabase: DatabaseClient; userId: string }): Promise<string[]> {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  return ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
}

async function assertAgent(ctx: { supabase: DatabaseClient; userId: string }) {
  const roles = await rolesOf(ctx);
  if (!roles.includes("agent")) throw new Error("Forbidden: agents only");
}

/** Agent-only: create a new account. It is active immediately for 7 days — no owner approval. */
export const agentCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        username: z
          .string()
          .min(2)
          .max(60)
          .regex(/^[a-zA-Z0-9._-]+$/, "letters, digits, . _ - only"),
        password: passwordSchema(),
        display_name: z.string().max(120).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAgent(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = `${data.username.toLowerCase()}@MikroMagic`;

    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.display_name ?? data.username },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Failed to create user");
    }
    const userId = created.data.user.id;

    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, username: data.username, display_name: data.display_name ?? data.username },
        { onConflict: "id" },
      );

    // The Agent is the direct parent/creator. Referral attribution remains separate
    // and is recorded below for Magic Coins commission.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "client",
      owner_id: context.userId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await supabaseAdmin.from("owner_accounts").upsert(
      {
        username: data.username,
        auth_email: email,
        user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "username" },
    );

    // Application owner hires Agents to recruit café Users — tag under this Agent for Magic Coins.
    await supabaseAdmin
      .from("account_referrals")
      .upsert({ user_id: userId, agent_id: context.userId }, { onConflict: "user_id" });

    // No signup commission — Magic Coins are earned on monthly/annual plan purchases from this User.

    // Notify Application owner (Primary) when present; otherwise skip quietly.
    const { data: primaryRow } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "primary")
      .limit(1)
      .maybeSingle();
    const primaryId = (primaryRow?.user_id as string | null) ?? null;

    const { data: agentProfile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username")
      .eq("id", context.userId)
      .maybeSingle();
    const agentName = agentProfile?.display_name ?? agentProfile?.username ?? "An agent";
    if (primaryId) {
      await supabaseAdmin.from("admin_notifications").insert({
        recipient_id: primaryId,
        kind: "agent_account_created",
        title: "New account created",
        body: `${agentName} recruited café User ${data.username}. Active for 7 days (tagged under the agent for Magic Coins commission).`,
        data: { user_id: userId, agent_id: context.userId, username: data.username },
      });
    }

    return { ok: true, id: userId };
  });

/** Accounts the signed-in agent introduced, with their current status. */
export const listMyReferrals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAgent(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: refs } = await supabaseAdmin
      .from("account_referrals")
      .select("user_id, created_at")
      .eq("agent_id", context.userId)
      .order("created_at", { ascending: false });

    const ids = (refs ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];

    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, username, display_name").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role, expires_at").in("user_id", ids),
    ]);

    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.username ?? p.display_name ?? "—"]),
    );
    const roleById = new Map<string, { role: string; expires_at: string | null }>();
    for (const r of roles ?? [])
      roleById.set(r.user_id, { role: r.role, expires_at: r.expires_at });

    return (refs ?? []).map((r) => ({
      user_id: r.user_id,
      name: nameById.get(r.user_id) ?? "—",
      created_at: r.created_at,
      role: roleById.get(r.user_id)?.role ?? "unknown",
      expires_at: roleById.get(r.user_id)?.expires_at ?? null,
    }));
  });

/**
 * Magic Coin ledger. Agents see their own rows; owner/admin staff see the
 * rows of their OWN tenant only. Cross-tenant visibility is limited to
 * explicitly listed platform administrators.
 *
 * The read runs with the service role, so RLS is not in play here: every
 * query below is tenant-filtered in code.
 */
export const listAgentPoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await rolesOf(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: platformRow } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const isPlatformAdmin = Boolean(platformRow);
    const isStaff = hasTenantPrimaryRole(roles) || isPlatformAdmin;
    const isAgent = roles.includes("agent");
    if (!isStaff && !isAgent) throw new Error("Forbidden");

    const { appStartOfMonth } = await import("./time");
    const periodStart = new Date(appStartOfMonth()).toISOString();

    const { data: ownerId } = await supabaseAdmin.rpc("effective_owner", {
      _user_id: context.userId,
    });
    const tenantId = (ownerId as string | null) ?? context.userId;

    let q = supabaseAdmin
      .from("agent_points")
      .select(
        "id, agent_id, referred_user_id, owner_id, kind, points, note, created_at, service_purchase_id, service_key, billing_period, source_status, reverses_point_id",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (!isStaff) q = q.eq("agent_id", context.userId);
    else {
      const { applyTenantFilter } = await import("./tenant-scope");
      q = applyTenantFilter(q, { userId: context.userId, tenantId, isPlatformAdmin });
    }
    const { data: rows } = await q;
    const events = (rows ?? []).map((e) => ({ ...e, points: Number(e.points) }));

    const ids = Array.from(
      new Set([
        ...events.map((e) => e.agent_id),
        ...events.map((e) => e.referred_user_id).filter(Boolean),
      ]),
    ) as string[];
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, username, display_name").in("id", ids)
      : { data: [] as Array<{ id: string; username: string | null; display_name: string | null }> };
    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.username ?? p.display_name ?? "—"]),
    );

    const total = events.reduce((s, e) => s + e.points, 0);
    const thisMonth = events
      .filter((e) => e.created_at >= periodStart)
      .reduce((s, e) => s + e.points, 0);

    const byAgentMap = new Map<
      string,
      { agent_id: string; name: string; points: number; events: number }
    >();
    for (const e of events) {
      const cur = byAgentMap.get(e.agent_id) ?? {
        agent_id: e.agent_id,
        name: nameById.get(e.agent_id) ?? "—",
        points: 0,
        events: 0,
      };
      cur.points += e.points;
      cur.events += 1;
      byAgentMap.set(e.agent_id, cur);
    }

    return {
      is_staff: isStaff,
      total_points: total,
      month_points: thisMonth,
      purchase_count: events.filter((e) => e.kind === "tier_pass_award").length,
      by_agent: Array.from(byAgentMap.values()).sort((a, b) => b.points - a.points),
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        points: e.points,
        created_at: e.created_at,
        service_key: e.service_key,
        billing_period: e.billing_period,
        source_status: e.source_status,
        service_purchase_id: e.service_purchase_id,
        agent_name: nameById.get(e.agent_id) ?? "—",
        referred_name: e.referred_user_id ? (nameById.get(e.referred_user_id) ?? "—") : "—",
        note: e.note,
      })),
    };
  });

/**
 * Last three months of commission data for the SIGNED-IN AGENT ONLY.
 *
 * Runs with the service role, so every query is filtered in code: clients come
 * from this agent's own referral rows, orders are restricted to those client
 * ids, and ledger rows to `agent_id = caller`. No cross-agent or cross-tenant
 * order is ever returned.
 */
export const agentCommissionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAgent(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 3);
    const sinceIso = since.toISOString();

    const { data: refs } = await supabaseAdmin
      .from("account_referrals")
      .select("user_id, created_at")
      .eq("agent_id", context.userId);
    const clientIds = (refs ?? []).map((r) => r.user_id);

    const [{ data: profiles }, { data: ledger }] = await Promise.all([
      clientIds.length
        ? supabaseAdmin.from("profiles").select("id, username, display_name").in("id", clientIds)
        : Promise.resolve({
            data: [] as Array<{ id: string; username: string | null; display_name: string | null }>,
          }),
      supabaseAdmin
        .from("agent_points")
        .select(
          "id, referred_user_id, kind, points, service_key, billing_period, source_status, service_purchase_id, created_at",
        )
        .eq("agent_id", context.userId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false }),
    ]);

    const { data: orders } = clientIds.length
      ? await supabaseAdmin
          .from("service_purchases")
          .select(
            "id, user_id, service_key, service_label, price_mmk, status, created_at, decided_at",
          )
          .in("user_id", clientIds)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
      : { data: [] as Array<Record<string, never>> };

    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.username ?? p.display_name ?? "—"]),
    );
    const rows = (ledger ?? []).map((e) => ({ ...e, points: Number(e.points) }));

    const byMonth = new Map<string, number>();
    for (const e of rows) {
      const key = e.created_at.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + e.points);
    }

    return {
      from: sinceIso,
      clients: (refs ?? []).map((r) => ({
        user_id: r.user_id,
        name: nameById.get(r.user_id) ?? "—",
        since: r.created_at,
      })),
      orders: (orders ?? []).map((o) => ({
        ...(o as Record<string, unknown>),
        client_name: nameById.get((o as { user_id: string }).user_id) ?? "—",
      })),
      points: rows.map((e) => ({
        ...e,
        client_name: e.referred_user_id ? (nameById.get(e.referred_user_id) ?? "—") : "—",
      })),
      total_points: rows.reduce((s, e) => s + e.points, 0),
      by_month: Array.from(byMonth.entries())
        .map(([month, points]) => ({ month, points }))
        .sort((a, b) => (a.month < b.month ? 1 : -1)),
    };
  });
