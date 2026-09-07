import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Row = {
  id: string;
  owner_id: string;
  router_id: string | null;
  site_id: string | null;
  source_ip: string | null;
  facility: string | null;
  severity: string;
  program: string | null;
  message: string;
  ai_summary: string | null;
  ai_severity: string | null;
  received_at: string;
};

/** List recent syslog events for the caller's tenant, filtered by site if provided. */
export const listSyslogEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        siteId: z.string().uuid().nullable().optional(),
        severity: z.enum(["all", "critical", "warning", "info"]).default("all"),
        limit: z.number().int().min(1).max(5000).default(1000),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    let q = context.supabase
      .from("syslog_events")
      .select(
        "id, owner_id, router_id, site_id, source_ip, facility, severity, program, message, ai_summary, ai_severity, received_at",
      )
      .order("received_at", { ascending: false })
      .limit(data.limit);
    if (data.siteId) q = q.eq("site_id", data.siteId);
    if (data.severity !== "all") q = q.eq("severity", data.severity);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Row[];
  });

/** List ingest tokens (metadata only — the secret is never stored or returned). */
export const listSyslogTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("syslog_tokens")
      .select("id, label, token_prefix, created_at, last_used_at, router_id, site_id")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Create a new ingest token. Plaintext is returned once; only the hash is stored. */
export const createSyslogToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        label: z.string().max(80).optional(),
        siteId: z.string().uuid().nullable().optional(),
        routerId: z.string().uuid().nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "syslog_ai");

    const { data: ownerId, error: ownerErr } = await context.supabase.rpc("effective_owner", {
      _user_id: context.userId,
    });
    if (ownerErr || !ownerId) throw new Error("Could not resolve account owner.");

    const { SYSLOG_MAX_TOKENS_PER_OWNER } = await import("./syslog-ingest");
    const { newSyslogToken } = await import("./syslog-ingest.server");
    const { count } = await context.supabase
      .from("syslog_tokens")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= SYSLOG_MAX_TOKENS_PER_OWNER) {
      throw new Error(
        `Token limit reached (${SYSLOG_MAX_TOKENS_PER_OWNER}). Revoke an unused token first.`,
      );
    }

    let siteId = data.siteId ?? null;
    const routerId = data.routerId ?? null;
    if (routerId) {
      const { data: router } = await context.supabase
        .from("router_connections")
        .select("id, site_id")
        .eq("id", routerId)
        .maybeSingle();
      if (!router) throw new Error("Unknown router.");
      if (router.site_id) siteId = router.site_id;
    }
    if (siteId) {
      const { data: site } = await context.supabase
        .from("sites")
        .select("id")
        .eq("id", siteId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (!site) throw new Error("Unknown site.");
    }

    const minted = newSyslogToken();
    const { data: row, error } = await context.supabase
      .from("syslog_tokens")
      .insert({
        owner_id: ownerId,
        token_hash: minted.hash,
        token_prefix: minted.prefix,
        label: data.label ?? null,
        router_id: routerId,
        site_id: siteId,
      })
      .select("id, label, token_prefix, created_at, router_id, site_id")
      .single();
    if (error) throw new Error(error.message);
    return { ...row, token: minted.token };
  });

/** Revoke an ingest token. */
export const deleteSyslogToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "syslog_ai");
    const { error } = await context.supabase.from("syslog_tokens").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Translate a batch of syslog events into plain English with Lovable AI. */
export const translateSyslogEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(25) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "syslog_ai");

    const { data: rows, error } = await context.supabase
      .from("syslog_events")
      .select("id, severity, program, message, source_ip")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    if (!rows?.length) return { updated: 0 };

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const system = `You are a MikroTik RouterOS 7 log analyst.
Given a JSON array of raw syslog events, return plain-English summaries for network operators.
Respond ONLY with JSON: {"items":[{"id":"<event-id>","severity":"critical|warning|info","summary":"one sentence in plain English, no jargon"}]}
Rules:
- Preserve the given id exactly.
- Summary <= 160 chars, no line breaks.
- Choose severity from evidence in the raw event (auth failures, link down, DoS = critical/warning).`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ events: rows }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("AI rate limit reached — try again shortly.");
      if (res.status === 402)
        throw new Error("AI credits exhausted. Add credits in Settings → Plans & credits.");
      const { toErrorMessage } = await import("./error-message");
      throw new Error(toErrorMessage(`AI gateway ${res.status}: ${t.slice(0, 200)}`));
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    {
      const { logAiUsage } = await import("./ai-usage.server");
      const { effectiveOwner } = await import("./guards.server");
      await logAiUsage({
        ownerId: await effectiveOwner(context.supabase, context.userId),
        userId: context.userId,
        feature: "syslog_translate",
        model: "google/gemini-2.5-flash",
        usage: json.usage,
      });
    }
    let parsed: { items?: Array<{ id: string; severity?: string; summary?: string }> } = {};
    try {
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = { items: [] };
    }
    let updated = 0;
    for (const it of parsed.items ?? []) {
      if (!it.id || !it.summary) continue;
      const { error: uerr } = await context.supabase
        .from("syslog_events")
        .update({
          ai_summary: it.summary.slice(0, 400),
          ai_severity: ["critical", "warning", "info"].includes(String(it.severity))
            ? (it.severity as string)
            : null,
        })
        .eq("id", it.id);
      if (!uerr) updated += 1;
    }
    return { updated };
  });

/** Delete one syslog event. */
export const deleteSyslogEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("syslog_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PairedLogSource = {
  id: string;
  name: string;
  site_id: string | null;
  kind: "hub" | "connector";
  status: string | null;
};

const PAIRED_ROUTER_SELECT =
  "id, name, site_id, connection_mode, connector_id, cloud_peer_id, cloud_status";

export const listPairedLogSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PairedLogSource[]> => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { pairedLogKind } = await import("./syslog-paired");
    const { data, error } = await context.supabase
      .from("router_connections")
      .select(PAIRED_ROUTER_SELECT)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const out: PairedLogSource[] = [];
    for (const row of data ?? []) {
      const kind = pairedLogKind(row);
      if (!kind) continue;
      out.push({
        id: row.id,
        name: row.name,
        site_id: row.site_id,
        kind,
        status: kind === "hub" ? (row.cloud_status ?? null) : "paired",
      });
    }
    return out;
  });

export type PairedLogSyncResult = {
  sources: Array<{
    id: string;
    name: string;
    kind: "hub" | "connector";
    ingested: number;
    pulled: number;
    error: string | null;
  }>;
  ingested: number;
};

/** Pull `/log` over Magic Hub / Local Connector REST — no second ingest token. */
export const syncPairedRouterLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        siteId: z.string().uuid().nullable().optional(),
        routerId: z.string().uuid().optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }): Promise<PairedLogSyncResult> => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    const ownerId = await guards.effectiveOwner(context.supabase, context.userId);
    const { dropSeenPairedLogs, mapRouterOsLogsToEvents, pairedLogDedupeKey, pairedLogKind } =
      await import("./syslog-paired");
    const { pullPairedRouterLogs } = await import("./syslog-paired.server");

    let q = context.supabase.from("router_connections").select(PAIRED_ROUTER_SELECT);
    if (data.routerId) q = q.eq("id", data.routerId);
    if (data.siteId) q = q.eq("site_id", data.siteId);
    const { data: routers, error } = await q;
    if (error) throw new Error(error.message);

    const targets = (routers ?? []).filter((row) => pairedLogKind(row)).slice(0, 8);
    const { loadRouterConn } = await import("./router-conn.server");

    const sources: PairedLogSyncResult["sources"] = [];
    let ingested = 0;
    for (const row of targets) {
      const kind = pairedLogKind(row);
      if (!kind) continue;
      try {
        const conn = await loadRouterConn(context.supabase, row.id);
        const logs = await pullPairedRouterLogs(conn);
        const incoming = mapRouterOsLogsToEvents(logs, {
          owner_id: ownerId,
          router_id: row.id,
          site_id: row.site_id,
          source_ip: kind === "hub" ? "magic-hub" : "local-connector",
        });
        const { data: recent, error: recentErr } = await context.supabase
          .from("syslog_events")
          .select("facility, message")
          .eq("router_id", row.id)
          .order("received_at", { ascending: false })
          .limit(400);
        if (recentErr) throw new Error(recentErr.message);
        const seen = (recent ?? []).map((e) => pairedLogDedupeKey(e.facility ?? "", e.message));
        const fresh = dropSeenPairedLogs(incoming, seen);
        if (fresh.length) {
          // Paired sync runs as the user JWT. syslog_events had no INSERT
          // policy, so RLS rejected every row. Stamp owner_id from
          // effective_owner, then write with the service role (same pattern
          // as health samples / HTTPS ingest).
          if (fresh.some((row) => row.owner_id !== ownerId)) {
            throw new Error("Refusing to store logs for another account.");
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error: insErr } = await supabaseAdmin.from("syslog_events").insert(fresh);
          if (insErr) throw new Error(insErr.message);
        }
        ingested += fresh.length;
        sources.push({
          id: row.id,
          name: row.name,
          kind,
          ingested: fresh.length,
          pulled: logs.length,
          error: null,
        });
      } catch (err) {
        sources.push({
          id: row.id,
          name: row.name,
          kind,
          ingested: 0,
          pulled: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { sources, ingested };
  });
