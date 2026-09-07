import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  buildMagicStep,
  scoreMagicSteps,
  type MagicGoLive,
  type MagicStep,
  type MagicStepStatus,
} from "./magic-go-live";

/**
 * Tenant (or site-scoped) Magic go-live checklist.
 * Cheap DB counts + one optional Hotspot probe on the focus router.
 */
export const getMagicGoLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        siteId: z.string().uuid().nullable().optional(),
        /** Skip RouterOS hotspot probe (Sites list chips). */
        skipHotspotProbe: z.boolean().optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }): Promise<MagicGoLive> => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const siteId = data?.siteId ?? null;
    const skipHotspot = data?.skipHotspotProbe === true;

    const { data: ownerRow } = await context.supabase.rpc("effective_owner", {
      _user_id: context.userId,
    });
    const ownerId = (ownerRow as string | null) ?? context.userId;

    let siteName: string | null = null;
    if (siteId) {
      const { data: site } = await context.supabase
        .from("sites")
        .select("id, name")
        .eq("id", siteId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (!site) {
        const steps = [
          buildMagicStep("site", "todo", "That site was not found on your account."),
          buildMagicStep("router", "blocked"),
          buildMagicStep("online", "blocked"),
          buildMagicStep("hotspot", "blocked"),
          buildMagicStep("plans", "blocked"),
          buildMagicStep("vouchers", "blocked"),
          buildMagicStep("portal", "blocked"),
        ];
        return {
          siteId,
          siteName: null,
          routerId: null,
          routerName: null,
          steps,
          ...scoreMagicSteps(steps),
        };
      }
      siteName = site.name as string;
    } else {
      const { count } = await context.supabase
        .from("sites")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId);
      if ((count ?? 0) > 0) {
        const { data: first } = await context.supabase
          .from("sites")
          .select("id, name")
          .eq("owner_id", ownerId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        siteName = (first?.name as string | null) ?? "Sites";
      }
    }

    const { filterPhysicalRouters } = await import("./test-router");
    let routerQuery = context.supabase
      .from("router_connections")
      .select("id, name, site_id, connection_mode, is_virtual, is_default")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true });
    if (siteId) routerQuery = routerQuery.eq("site_id", siteId);
    const { data: routerRows } = await routerQuery;
    const physical = filterPhysicalRouters(routerRows ?? []);

    const focus = physical.find((r) => r.is_default) ?? physical[0] ?? null;

    const siteOk: MagicStepStatus = siteId ? "done" : siteName ? "done" : "todo";

    const routerOk: MagicStepStatus =
      physical.length > 0 ? "done" : siteOk === "todo" ? "blocked" : "todo";

    // Online: use lightweight status (same as Home).
    let onlineOk: MagicStepStatus = "blocked";
    let onlineDetail: string | undefined;
    if (focus) {
      try {
        const { routersStatus } = await import("./routers.functions");
        // routersStatus is a server fn — call the underlying logic via REST ping path used by status.
        const { loadRouterConn } = await import("./router-conn.server");
        const { routerAPI } = await import("./mikrotik.server");
        const conn = await loadRouterConn(context.supabase, focus.id);
        await routerAPI.ping(conn);
        onlineOk = "done";
        onlineDetail = `${focus.name} reachable`;
      } catch (e) {
        onlineOk = "todo";
        onlineDetail = e instanceof Error ? e.message : "Router not reachable yet";
      }
    } else if (routerOk === "todo") {
      onlineOk = "blocked";
    }

    let hotspotOk: MagicStepStatus = "unknown";
    let hotspotDetail: string | undefined;
    if (skipHotspot) {
      hotspotOk = onlineOk === "done" ? "unknown" : "blocked";
      hotspotDetail =
        onlineOk === "done" ? "Open Routers → Hotspot Wi‑Fi to confirm guest SSID." : undefined;
    } else if (onlineOk === "done" && focus) {
      try {
        const { loadRouterConn } = await import("./router-conn.server");
        const { probeWifiHotspot, assessHotspotGuestReady } = await import("./wifi-hotspot.server");
        const conn = await loadRouterConn(context.supabase, focus.id);
        const probe = await probeWifiHotspot(conn);
        const ready = assessHotspotGuestReady(probe);
        if (ready.level === "ok") {
          hotspotOk = "done";
          hotspotDetail = ready.guestSsids.length
            ? `SSID: ${ready.guestSsids.join(", ")}`
            : "Guest hotspot ready";
        } else if (ready.foundationReady) {
          hotspotOk = "todo";
          hotspotDetail = ready.summary;
        } else {
          hotspotOk = "todo";
          hotspotDetail = ready.summary;
        }
      } catch (e) {
        hotspotOk = "todo";
        hotspotDetail = e instanceof Error ? e.message : "Could not probe Hotspot";
      }
    } else {
      hotspotOk = "blocked";
    }

    const { count: planCount } = await context.supabase
      .from("portal_plans")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);

    let plansOk: MagicStepStatus = "todo";
    let plansDetail: string | undefined;
    if ((planCount ?? 0) === 0) {
      plansOk = hotspotOk === "blocked" && routerOk !== "done" ? "blocked" : "todo";
    } else if (onlineOk === "done" && focus) {
      try {
        const { loadRouterConn } = await import("./router-conn.server");
        const { routerAPI } = await import("./mikrotik.server");
        const { isManagedVoucherProfile } = await import("./portal/plan-profile");
        const conn = await loadRouterConn(context.supabase, focus.id);
        const existing = (await routerAPI.profiles(conn)) ?? [];
        const onBoard = existing.filter((row) => isManagedVoucherProfile(row));
        if (onBoard.length > 0) {
          plansOk = "done";
          plansDetail = `${onBoard.length} profile${onBoard.length === 1 ? "" : "s"} on ${focus.name}`;
        } else {
          plansOk = "todo";
          plansDetail = `${planCount} in catalog — open Vouchers → Add to router.`;
        }
      } catch (e) {
        plansOk = "todo";
        plansDetail =
          e instanceof Error
            ? e.message
            : `${planCount} in catalog — push to router when the board is online.`;
      }
    } else {
      plansOk = "todo";
      plansDetail = `${planCount} in catalog — push to router when online.`;
    }

    let voucherQuery = context.supabase
      .from("voucher_codes")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .neq("status", "expired");
    if (focus) voucherQuery = voucherQuery.eq("router_id", focus.id);
    const { count: voucherCount } = await voucherQuery;
    const vouchersOk: MagicStepStatus =
      (voucherCount ?? 0) > 0 ? "done" : plansOk === "done" ? "todo" : "blocked";

    let portalOk: MagicStepStatus = "todo";
    let portalDetail: string | undefined;
    {
      let deployQuery = context.supabase
        .from("portal_deploy_audit")
        .select("ok, created_at, router_id")
        .eq("owner_id", ownerId)
        .eq("ok", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (focus) deployQuery = deployQuery.eq("router_id", focus.id);
      const { data: deploy } = await deployQuery.maybeSingle();
      if (deploy?.ok) {
        portalOk = "done";
        portalDetail = `Last publish ${new Date(deploy.created_at as string).toLocaleString()}`;
      } else if (vouchersOk !== "done" && plansOk !== "done") {
        portalOk = "blocked";
      } else {
        portalOk = "todo";
        portalDetail = "No successful portal publish on this board yet.";
      }
    }

    const hasSites =
      siteOk === "done" ||
      (await context.supabase
        .from("sites")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .then((r) => (r.count ?? 0) > 0));

    const steps: MagicStep[] = [
      buildMagicStep(
        "site",
        hasSites || siteId ? "done" : "todo",
        siteName ? `“${siteName}”` : undefined,
      ),
      buildMagicStep(
        "router",
        routerOk,
        focus
          ? `${physical.length} board${physical.length === 1 ? "" : "s"} · focus ${focus.name}`
          : siteId
            ? "No router attached to this site yet — assign one on Sites."
            : undefined,
      ),
      buildMagicStep("online", onlineOk, onlineDetail),
      buildMagicStep("hotspot", hotspotOk, hotspotDetail),
      buildMagicStep(
        "plans",
        plansOk,
        plansDetail ??
          ((planCount ?? 0) > 0 ? `${planCount} plan${planCount === 1 ? "" : "s"}` : undefined),
      ),
      buildMagicStep(
        "vouchers",
        vouchersOk,
        (voucherCount ?? 0) > 0
          ? `${voucherCount} active code${voucherCount === 1 ? "" : "s"}`
          : undefined,
      ),
      buildMagicStep("portal", portalOk, portalDetail),
    ];

    return {
      siteId,
      siteName,
      routerId: focus?.id ?? null,
      routerName: focus?.name ?? null,
      steps,
      ...scoreMagicSteps(steps),
    };
  });
