// Server-only: run the AI fleet scan for one owner and persist the result.
// Shared by the hourly cron route and the manual "Run AI scan" action.
import type { Json } from "@/integrations/supabase/types";
import type { DatabaseClient } from "./database.types";
import { buildDeterministicInsights } from "./fleet-detectors";
import type { FleetInsight } from "./fleet-health";

export type ScanRouterRow = {
  id: string;
  name: string;
  host: string;
  connection_mode?: string | null;
  connector_id?: string | null;
};

function mergeInsights(deterministic: FleetInsight[], ai: FleetInsight[]): FleetInsight[] {
  const seen = new Set(deterministic.map((i) => i.id));
  const merged = [...deterministic];
  for (const i of ai) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    merged.push(i);
  }
  const rank = (s: string) => (s === "critical" ? 0 : s === "warning" ? 1 : 2);
  merged.sort((a, b) => rank(a.severity) - rank(b.severity));
  return merged.slice(0, 12);
}

export async function runAiScanForOwner(
  ownerId: string,
  routers: ScanRouterRow[],
  triggeredBy: string | null = null,
  supabase?: DatabaseClient,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabase ?? supabaseAdmin;
  const { loadRouterConn, loadRouterConnForOwner } = await import("./router-conn.server");
  const { routerAPI } = await import("./mikrotik.server");
  const { collectFleetSnapshot } = await import("./fleet-probe.server");

  const probed = await Promise.all(
    routers.map((r) =>
      collectFleetSnapshot(r, {
        loadConn: (id) =>
          supabase
            ? loadRouterConn(db, id)
            : loadRouterConnForOwner(supabaseAdmin, id, ownerId),
        api: {
          ping: routerAPI.ping,
          activeUsers: routerAPI.activeUsers,
          listBindings: routerAPI.listBindings,
          hosts: routerAPI.hosts,
          users: routerAPI.users,
          raw: routerAPI.raw,
        },
      }),
    ),
  );

  const snapshots = probed.map((p) => ({
    id: p.id,
    router: p.name,
    host: p.host,
    online: p.online,
    version: p.version,
    board_name: p.board_name,
    identity: p.identity,
    cpu_load: p.cpu_load,
    free_memory: p.free_memory,
    total_memory: p.total_memory,
    uptime: p.uptime,
    temperature_c: p.temperature_c,
    active_sessions: p.active_sessions,
    blocked_bindings: p.blocked_bindings,
    hosts: p.hosts,
    hotspot_users: p.hotspot_users,
    interfaces_down: p.interfaces_down,
    dhcp_pools: p.dhcp_pools,
    wireguard_peers: p.wireguard_peers,
    firewall_rules: p.firewall_rules,
    queue_trees: p.queue_trees,
    error: p.error,
    connection_mode: p.connection_mode,
  }));

  const deterministic = buildDeterministicInsights(
    probed.map((p) => ({
      id: p.id,
      name: p.name,
      online: p.online,
      error: p.error,
      board_name: p.board_name,
      version: p.version,
      cpu_load: p.cpu_load,
      free_memory: p.free_memory,
      total_memory: p.total_memory,
      uptime: p.uptime,
      active_sessions: p.active_sessions,
      temperature_c: p.temperature_c,
      interfaces_down: p.interfaces_down,
      dhcp_pools: p.dhcp_pools,
      wireguard_peers: p.wireguard_peers,
      firewall_rules: p.firewall_rules,
      queue_trees: p.queue_trees,
    })),
  );

  let aiInsights: FleetInsight[] = [];
  const key = process.env.LOVABLE_API_KEY;
  if (key) {
    const system = `You are a MikroTik RouterOS 7 fleet operations analyst.
Given a JSON snapshot of one or more routers (real probe fields only), return actionable insights.
Respond ONLY with JSON of shape: {"insights":[{"id":"kebab","severity":"critical|warning|info","title":"...","subtitle":"router · evidence","router":"router-name","router_id":"uuid-if-known","suggestion":"what to do","fix_command":"RouterOS CLI"}]}
At most 8 insights, most urgent first. Empty array if nothing wrong.
Do not invent facts. Prefer measured fields (cpu_load, temperature_c, dhcp_pools, interfaces_down, wireguard_peers).
fix_command must be a single-line safe RouterOS command; omit if unsure.`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ routers: snapshots }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    {
      const { logAiUsage } = await import("./ai-usage.server");
      await logAiUsage({
        ownerId,
        userId: triggeredBy ?? ownerId,
        feature: "fleet_scan",
        model: "google/gemini-2.5-flash",
        usage: json.usage,
      });
    }
    let parsed: { insights?: FleetInsight[] } = {};
    try {
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }
    const byName = new Map(probed.map((p) => [p.name, p.id]));
    aiInsights = (parsed.insights ?? []).slice(0, 8).map((i, idx) => ({
      ...i,
      id: i.id || `ai-${idx}`,
      router_id: i.router_id || (i.router ? byName.get(i.router) : undefined),
    }));
  } else if (deterministic.length === 0) {
    throw new Error("Missing LOVABLE_API_KEY");
  }

  const insights = mergeInsights(deterministic, aiInsights);
  const maxSev = insights.reduce<"critical" | "warning" | "info" | "ok">((acc, i) => {
    if (i.severity === "critical") return "critical";
    if (i.severity === "warning" && acc !== "critical") return "warning";
    if (i.severity === "info" && acc === "ok") return "info";
    return acc;
  }, "ok");

  const { error } = await supabaseAdmin.from("fleet_scan_runs").insert({
    owner_id: ownerId,
    kind: "ai",
    payload: { insights, snapshot: snapshots, deterministic_count: deterministic.length } as Json,
    max_severity: maxSev,
    router_count: routers.length,
    triggered_by: triggeredBy,
  });
  if (error) throw new Error(error.message);

  // Promote critical measured findings into Incidents (Owner ops trail).
  try {
    const critical = insights.filter((i) => i.severity === "critical" && i.router_id);
    if (critical.length) {
      await supabaseAdmin.from("incidents").upsert(
        critical.map((i) => ({
          owner_id: ownerId,
          kind: i.id.startsWith("iface-down")
            ? "interface_down"
            : i.id.startsWith("dhcp-pool")
              ? "dhcp_pool_high"
              : i.id.startsWith("wg-peers")
                ? "vpn_peer_down"
                : "router_anomaly",
          severity: "critical",
          subject_id: i.router_id!,
          subject_label: i.router ?? i.router_id!,
          detail: [i.title, i.subtitle, i.fix_command].filter(Boolean).join(" · "),
          last_seen_at: new Date().toISOString(),
          last_notified_at: new Date().toISOString(),
        })),
        { onConflict: "owner_id,kind,subject_id", ignoreDuplicates: true },
      );
    }
  } catch {
    /* incident kinds may not be migrated yet — scan still succeeds */
  }

  return {
    owner_id: ownerId,
    insights: insights.length,
    max_severity: maxSev,
    deterministic: deterministic.length,
  };
}
