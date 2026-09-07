import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildSiteTopologySnapshot } from "./topology/build-topology";
import { probeRouterLanTopology } from "./topology/probe.server";
import type {
  SiteTopologySnapshot,
  TopologyMagicDudeInsight,
  TopologyPortLabel,
} from "./topology/types";
import type { DatabaseClient } from "./database.types";

const portLabelSchema = z.object({
  port: z.string().min(1).max(32),
  label: z.string().max(80),
  kind: z.enum(["switch", "ap", "other"]).default("other"),
});

async function assertPlatformAdmin(ctx: { supabase: unknown; userId: string }) {
  const { requirePlatformAdmin } = await import("./admin-scope.server");
  await requirePlatformAdmin(ctx as never);
}

type HomeTopologyScope = {
  db: DatabaseClient;
  accessClient: DatabaseClient;
  isPlatformAdmin: boolean;
  ownerId: string;
};

/** Tenant-scoped read access for the Home topology card. */
async function resolveHomeTopologyScope(context: {
  supabase: DatabaseClient;
  userId: string;
}): Promise<HomeTopologyScope> {
  const { effectiveOwner, isPlatformAdminUser, requireNotExpired } =
    await import("./guards.server");
  await requireNotExpired(context.supabase, context.userId);
  if (await isPlatformAdminUser(context.supabase, context.userId)) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return {
      db: supabaseAdmin,
      accessClient: context.supabase,
      isPlatformAdmin: true,
      ownerId: context.userId,
    };
  }
  return {
    db: context.supabase,
    accessClient: context.supabase,
    isPlatformAdmin: false,
    ownerId: await effectiveOwner(context.supabase, context.userId),
  };
}

/** Route guard — platform administrators only (internal topology beta). */
export const assertTopologyPlatformAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
  });

function parsePortLabels(raw: unknown): TopologyPortLabel[] {
  if (!Array.isArray(raw)) return [];
  const out: TopologyPortLabel[] = [];
  for (const row of raw) {
    const parsed = portLabelSchema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Platform-admin catalog: sites that have at least one physical router. */
export const listTopologySites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { filterPhysicalRouters } = await import("./test-router");

    const [{ data: routers, error: rErr }, { data: sites, error: sErr }] = await Promise.all([
      supabaseAdmin
        .from("router_connections")
        .select("id, name, site_id, owner_id, is_virtual")
        .order("name"),
      supabaseAdmin.from("sites").select("id, name, location, owner_id"),
    ]);
    if (rErr) throw new Error(rErr.message);
    if (sErr) throw new Error(sErr.message);

    const physical = filterPhysicalRouters(routers ?? []);
    const siteById = new Map((sites ?? []).map((s) => [s.id, s]));

    type Entry = {
      siteId: string;
      siteName: string;
      location: string | null;
      routers: Array<{ id: string; name: string }>;
    };
    const map = new Map<string, Entry>();

    for (const r of physical) {
      if (!r.site_id) continue;
      const site = siteById.get(r.site_id);
      if (!site) continue;
      let entry = map.get(r.site_id);
      if (!entry) {
        entry = {
          siteId: r.site_id,
          siteName: site.name,
          location: site.location ?? null,
          routers: [],
        };
        map.set(r.site_id, entry);
      }
      entry.routers.push({ id: r.id, name: r.name });
    }

    return [...map.values()].sort((a, b) => a.siteName.localeCompare(b.siteName));
  });

/** Sites visible in the signed-in operator's Home topology card. */
export const listHomeTopologySites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveHomeTopologyScope(context);
    const { filterPhysicalRouters } = await import("./test-router");

    let routersQuery = scope.db
      .from("router_connections")
      .select("id, name, site_id, owner_id, is_virtual")
      .order("name");
    let sitesQuery = scope.db.from("sites").select("id, name, location, owner_id");
    if (!scope.isPlatformAdmin) {
      routersQuery = routersQuery.eq("owner_id", scope.ownerId);
      sitesQuery = sitesQuery.eq("owner_id", scope.ownerId);
    }

    const [{ data: routers, error: routerError }, { data: sites, error: siteError }] =
      await Promise.all([routersQuery, sitesQuery]);
    if (routerError) throw new Error(routerError.message);
    if (siteError) throw new Error(siteError.message);

    const siteById = new Map((sites ?? []).map((site) => [site.id, site]));
    const entries = new Map<
      string,
      {
        siteId: string;
        siteName: string;
        location: string | null;
        routers: Array<{ id: string; name: string }>;
      }
    >();
    for (const router of filterPhysicalRouters(routers ?? [])) {
      if (!router.site_id) continue;
      const site = siteById.get(router.site_id);
      if (!site) continue;
      const entry = entries.get(router.site_id) ?? {
        siteId: router.site_id,
        siteName: site.name,
        location: site.location ?? null,
        routers: [],
      };
      entry.routers.push({ id: router.id, name: router.name });
      entries.set(router.site_id, entry);
    }
    return [...entries.values()].sort((a, b) => a.siteName.localeCompare(b.siteName));
  });

export const getSiteTopology = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        siteId: z.string().uuid(),
        routerId: z.string().uuid().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<SiteTopologySnapshot> => {
    const { snapshot } = await loadAuthorizedTopology(data, context);
    return snapshot;
  });

/** Tenant-scoped topology snapshot used only by the Home overview card. */
export const getHomeSiteTopology = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        siteId: z.string().uuid(),
        routerId: z.string().uuid().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<SiteTopologySnapshot> => {
    const scope = await resolveHomeTopologyScope(context);
    const { loadRouterConn } = await import("./router-conn.server");
    const { filterPhysicalRouters } = await import("./test-router");

    let siteQuery = scope.db.from("sites").select("id, name, owner_id").eq("id", data.siteId);
    if (!scope.isPlatformAdmin) siteQuery = siteQuery.eq("owner_id", scope.ownerId);
    const { data: site, error: siteError } = await siteQuery.maybeSingle();
    if (siteError) throw new Error(siteError.message);
    if (!site) throw new Error("Site not found.");

    let routersQuery = scope.db
      .from("router_connections")
      .select("id, name, site_id, owner_id, is_virtual")
      .eq("site_id", data.siteId);
    if (!scope.isPlatformAdmin) routersQuery = routersQuery.eq("owner_id", scope.ownerId);
    const { data: routers, error: routerError } = await routersQuery;
    if (routerError) throw new Error(routerError.message);

    const physical = filterPhysicalRouters(routers ?? []);
    if (!physical.length) throw new Error("No physical routers on this site.");
    const router = physical.find((item) => item.id === data.routerId) ?? physical[0]!;

    const { data: config } = await scope.db
      .from("site_topology_config")
      .select("port_labels")
      .eq("site_id", data.siteId)
      .maybeSingle();
    const probe = await probeRouterLanTopology(
      await loadRouterConn(scope.db, router.id, scope.accessClient),
    );
    return buildSiteTopologySnapshot({
      siteId: site.id,
      siteName: site.name,
      routerId: router.id,
      routerName: router.name,
      routerOnline: probe.reachable,
      probe,
      portLabels: parsePortLabels(config?.port_labels),
    });
  });

async function loadAuthorizedTopology(
  data: { siteId: string; routerId?: string },
  context: { supabase: DatabaseClient; userId: string },
) {
  await assertPlatformAdmin(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadRouterConn } = await import("./router-conn.server");
  const { filterPhysicalRouters } = await import("./test-router");

  const { data: site, error: siteErr } = await supabaseAdmin
    .from("sites")
    .select("id, name")
    .eq("id", data.siteId)
    .maybeSingle();
  if (siteErr) throw new Error(siteErr.message);
  if (!site) throw new Error("Site not found.");

  const { data: routers, error: routerErr } = await supabaseAdmin
    .from("router_connections")
    .select("id, name, site_id, owner_id, is_virtual")
    .eq("site_id", data.siteId);
  if (routerErr) throw new Error(routerErr.message);

  const physical = filterPhysicalRouters(routers ?? []);
  if (!physical.length) throw new Error("No physical routers on this site.");

  const router =
    physical.find((r) => r.id === data.routerId) ??
    physical.find((r) => r.name.toLowerCase().includes("rb")) ??
    physical[0]!;

  const { data: cfg } = await supabaseAdmin
    .from("site_topology_config")
    .select("router_id, port_labels")
    .eq("site_id", data.siteId)
    .maybeSingle();

  const portLabels = parsePortLabels(cfg?.port_labels);
  // Catalog reads are platform-admin scoped, but the lock check must carry
  // the authenticated caller. Passing supabaseAdmin here makes auth.uid()
  // null and falsely marks the included router as locked.
  const conn = await loadRouterConn(supabaseAdmin, router.id, context.supabase);
  const probe = await probeRouterLanTopology(conn);

  const snapshot = buildSiteTopologySnapshot({
    siteId: site.id,
    siteName: site.name,
    routerId: router.id,
    routerName: router.name,
    routerOnline: probe.reachable,
    probe,
    portLabels,
  });
  return { snapshot, ownerId: router.owner_id as string };
}

const magicDudeInputSchema = z.object({
  siteId: z.string().uuid(),
  routerId: z.string().uuid(),
  nodeId: z.string().min(1).max(128),
});

const magicDudeInsightSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(500),
  evidence: z.array(z.string().trim().min(1).max(240)).min(1).max(4),
  impact: z.string().trim().min(1).max(300),
  recommendation: z.string().trim().min(1).max(300),
  confidence: z.enum(["high", "medium", "low"]),
});

/**
 * Manual, explanation-only AI investigation for one selected topology node.
 * The server rebuilds the snapshot, so browser-provided topology data is never trusted.
 */
export const investigateTopologyWithMagicDude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => magicDudeInputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    // Authorize before checking allowance, probing a router, or contacting the AI gateway.
    await assertPlatformAdmin(context);
    const quotaMod = await import("./ai-quota.server");
    const quotaBefore = await quotaMod.aiScanQuota(context);
    quotaMod.assertScanAllowed(quotaBefore);

    const { snapshot, ownerId } = await loadAuthorizedTopology(data, context);
    const selectedNode = snapshot.nodes.find((node) => node.id === data.nodeId);
    if (!selectedNode) throw new Error("The selected topology node is no longer available.");

    const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
    const connections = snapshot.edges
      .filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id)
      .map((edge) => ({
        from: nodeById.get(edge.from)?.label ?? edge.from,
        to: nodeById.get(edge.to)?.label ?? edge.to,
        status: edge.status,
      }));
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Magic Dude is not configured yet. Missing LOVABLE_API_KEY.");

    const topologyEvidence = {
      site: snapshot.siteName,
      router: snapshot.routerName,
      routerOnline: snapshot.routerOnline,
      observedAt: new Date(snapshot.polledAt).toISOString(),
      selectedNode: {
        kind: selectedNode.kind,
        label: selectedNode.label,
        detail: selectedNode.detail ?? null,
        status: selectedNode.status,
      },
      directConnections: connections,
      guestPool: snapshot.guestPool
        ? {
            name: snapshot.guestPool.name,
            usagePct: snapshot.guestPool.usagePct,
            poolHealth: snapshot.poolHealth,
            healthDetail: snapshot.poolHealthDetail,
          }
        : null,
      probeError: snapshot.probeError,
    };
    const system = `You are Magic Dude, a careful MikroTik network topology assistant.
Analyze only the supplied observed topology evidence for one selected node.
Return ONLY JSON matching this shape:
{"title":"...","summary":"...","evidence":["..."],"impact":"...","recommendation":"...","confidence":"high|medium|low"}
Rules:
- Do not invent devices, causes, traffic, configurations, or measurements.
- Distinguish observed facts from possible causes. If evidence is incomplete, use low confidence.
- Give a safe read-only or physical verification recommendation only.
- Never return RouterOS commands, configuration changes, credentials, or destructive actions.
- Keep wording concise and clear for a network operator.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(topologyEvidence) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error("AI rate limit reached — try again shortly.");
      if (response.status === 402)
        throw new Error("AI credits exhausted. Add credits in Settings → Plans & credits.");
      throw new Error(`Magic Dude AI gateway ${response.status}. Try again shortly.`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    let insight: TopologyMagicDudeInsight;
    try {
      insight = magicDudeInsightSchema.parse(
        JSON.parse(payload.choices?.[0]?.message?.content ?? "{}"),
      );
    } catch {
      throw new Error("Magic Dude returned an invalid response. Try again shortly.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: scanError } = await supabaseAdmin.from("fleet_scan_runs").insert({
      owner_id: ownerId,
      kind: "ai",
      payload: {
        source: "topology_magic_dude",
        site_id: snapshot.siteId,
        router_id: snapshot.routerId,
        node_id: selectedNode.id,
        node_status: selectedNode.status,
      },
      max_severity:
        selectedNode.status === "down"
          ? "critical"
          : selectedNode.status === "unknown"
            ? "warning"
            : "ok",
      router_count: 1,
      triggered_by: context.userId,
    });
    if (scanError) throw new Error(scanError.message);

    const { logAiUsage } = await import("./ai-usage.server");
    await logAiUsage({
      ownerId,
      userId: context.userId,
      feature: "topology_magic_dude",
      model: "google/gemini-2.5-flash",
      usage: payload.usage,
    });
    return { insight, generatedAt: Date.now(), quota: await quotaMod.aiScanQuota(context) };
  });

export const saveSiteTopologyLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        siteId: z.string().uuid(),
        routerId: z.string().uuid(),
        portLabels: z.array(portLabelSchema),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("site_topology_config").upsert(
      {
        site_id: data.siteId,
        router_id: data.routerId,
        port_labels: data.portLabels,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
