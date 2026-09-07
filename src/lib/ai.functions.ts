import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Insight = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  subtitle: string;
  router: string;
  suggestion: string;
  fix_command?: string;
};

type Snapshot = {
  router: string;
  host: string;
  online: boolean;
  error?: string;
  version?: string;
  cpu_load?: string;
  free_memory?: string;
  total_memory?: string;
  uptime?: string;
  active_sessions?: number;
  blocked_bindings?: number;
  hosts?: number;
  hotspot_users?: number;
  active_sample?: Array<Record<string, string>>;
};

export const getAiInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const mode = (raw as { mode?: unknown } | undefined)?.mode;
    return { mode: mode === "full" ? ("full" as const) : ("flag" as const) };
  })
  .handler(async ({ data, context }) => {
    // Two modes:
    //  - "flag": background auto-check every 15 minutes. Flags anomalies only,
    //    never returns RouterOS commands, never consumes the manual allowance.
    //  - "full": the user pressed Run AI scan. Consumes one of the 30 monthly
    //    manual scans and returns the fix command for each finding.
    const isFull = data.mode === "full";
    const quotaMod = await import("./ai-quota.server");
    const quotaBefore = await quotaMod.aiScanQuota(context);
    if (quotaBefore.expired) throw new Error("Expired accounts cannot run AI scans.");
    if (isFull) quotaMod.assertScanAllowed(quotaBefore);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Pull the caller's routers and build a compact snapshot per router.
    const { data: rows, error } = await context.supabase
      .from("router_connections")
      .select("id, name, host, port, username, password_ciphertext, use_tls, connection_mode");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      return {
        insights: [] as Insight[],
        snapshot: [] as Snapshot[],
        generated_at: Date.now(),
        mode: data.mode,
        quota: quotaBefore,
      };
    }

    const { routerAPI } = await import("./mikrotik.server");
    const { loadRouterConn } = await import("./router-conn.server");

    const snapshots: Snapshot[] = await Promise.all(
      rows.map(async (r) => {
        const conn = await loadRouterConn(context.supabase, r.id);
        const snap: Snapshot = { router: r.name, host: r.host, online: false };
        try {
          const res = (await routerAPI.ping(conn)) as Record<string, string>;
          snap.online = true;
          snap.version = res?.version;
          snap.cpu_load = res?.["cpu-load"];
          snap.free_memory = res?.["free-memory"];
          snap.total_memory = res?.["total-memory"];
          snap.uptime = res?.uptime;
          const [active, bindings, hosts, users] = await Promise.allSettled([
            routerAPI.activeUsers(conn),
            routerAPI.listBindings(conn),
            routerAPI.hosts(conn),
            routerAPI.users(conn),
          ]);
          if (active.status === "fulfilled") {
            snap.active_sessions = active.value.length;
            snap.active_sample = active.value.slice(0, 5).map((a) => ({
              user: a.user ?? "",
              address: a.address ?? "",
              "mac-address": a["mac-address"] ?? "",
              uptime: a.uptime ?? "",
              "bytes-in": a["bytes-in"] ?? "",
              "bytes-out": a["bytes-out"] ?? "",
            }));
          }
          if (bindings.status === "fulfilled") {
            snap.blocked_bindings = bindings.value.filter((b) => b.type === "blocked").length;
          }
          if (hosts.status === "fulfilled") snap.hosts = hosts.value.length;
          if (users.status === "fulfilled") snap.hotspot_users = users.value.length;
        } catch (e) {
          snap.error = e instanceof Error ? e.message : String(e);
        }
        return snap;
      }),
    );

    const system = `You are a MikroTik RouterOS 7 network operations analyst.
Given a JSON snapshot of one or more routers, return actionable insights.
Respond ONLY with a compact JSON object of shape:
{"insights":[{"id":"kebab-slug","severity":"critical|warning|info","title":"...","subtitle":"router · one-line evidence","router":"router-name","suggestion":"what to do (one sentence)","fix_command":"RouterOS CLI command to apply the fix (omit if no safe command)"}]}
Rules:
- Return at most 5 insights, most urgent first.
- If nothing is wrong, return {"insights":[]}.
- Severity: offline routers or clearly failing state = critical; high CPU/memory (>85%), near-full hotspot pools, unusual session counts = warning; tips/optimizations = info.
- fix_command must be a single-line RouterOS command safe to run on the described router. No destructive wipes.
- Do NOT invent facts not present in the snapshot.`;

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ routers: snapshots }) },
      ],
      response_format: { type: "json_object" },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
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
    const { logAiUsage } = await import("./ai-usage.server");
    const { effectiveOwner } = await import("./guards.server");
    const ownerId = await effectiveOwner(context.supabase, context.userId);
    await logAiUsage({
      ownerId,
      userId: context.userId,
      feature: isFull ? "ai_insights" : "ai_insights_auto",
      model: "google/gemini-2.5-flash",
      usage: json.usage,
    });
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { insights?: Insight[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { insights: [] };
    }
    const insights = (parsed.insights ?? []).slice(0, 5).map((i, idx) => {
      const base = { ...i, id: i.id || `insight-${idx}` };
      // Auto flag runs never hand out commands — that's the manual scan's job.
      if (!isFull) {
        delete (base as { fix_command?: string }).fix_command;
      }
      return base;
    });

    let quota = quotaBefore;
    if (isFull) {
      // Recording the run is what consumes one of the monthly manual scans.
      const maxSev = insights.reduce<"critical" | "warning" | "info" | "ok">((acc, i) => {
        if (i.severity === "critical") return "critical";
        if (i.severity === "warning" && acc !== "critical") return "warning";
        if (i.severity === "info" && acc === "ok") return "info";
        return acc;
      }, "ok");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("fleet_scan_runs").insert({
        owner_id: ownerId,
        kind: "ai",
        payload: { insights, snapshot: snapshots } as never,
        max_severity: maxSev,
        router_count: snapshots.length,
        triggered_by: context.userId,
      });
      quota = await quotaMod.aiScanQuota(context);
    }

    return {
      insights,
      snapshot: snapshots,
      generated_at: Date.now(),
      mode: data.mode,
      quota,
    };
  });
