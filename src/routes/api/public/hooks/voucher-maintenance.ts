import { createFileRoute } from "@tanstack/react-router";

// Daily maintenance for the voucher system:
//  1. Sync used codes from each router (first-login time, bound device, expiry)
//  2. Terminate invalid active sessions and disable persistent users while
//     retaining the app ledger for audit, reporting, refunds and reconciliation
export const Route = createFileRoute("/api/public/hooks/voucher-maintenance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isAuthorizedCronRequest, cronUnauthorizedResponse } =
          await import("@/lib/cron-auth.server");
        if (!(await isAuthorizedCronRequest(request))) return cronUnauthorizedResponse();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadRouterConnForOwner } = await import("@/lib/router-conn.server");
        const { routerAPI } = await import("@/lib/mikrotik.server");
        const { enforcementTarget, enforceVoucherTarget } =
          await import("@/lib/voucher-enforcement.server");
        const { recordRouterOp } = await import("@/lib/audit.server");

        const now = Date.now();
        const summary = {
          synced: 0,
          expired: 0,
          routerUsersDisabled: 0,
          activeSessionsTerminated: 0,
          enforcementPending: 0,
          routers: 0,
          routersExcluded: 0,
        };
        const excludedRouterIds = new Set(
          (process.env.VOUCHER_MAINTENANCE_EXCLUDED_ROUTER_IDS ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        );

        // ---- 1 & 2: per-router sync + cleanup ----
        const { data: codes } = await supabaseAdmin
          .from("voucher_codes")
          .select("*")
          .not("router_id", "is", null);

        const byRouter = new Map<string, typeof codes>();
        for (const c of codes ?? []) {
          if (!c.router_id) continue;
          const list = byRouter.get(c.router_id) ?? [];
          list.push(c);
          byRouter.set(c.router_id, list as never);
        }

        for (const [routerId, list] of byRouter) {
          // Skip protected/out-of-scope boards before any database ownership
          // lookup or RouterOS connection is attempted.
          if (excludedRouterIds.has(routerId)) {
            summary.routersExcluded++;
            continue;
          }
          summary.routers++;
          let users: Array<Record<string, string>> = [];
          let active: Array<Record<string, string>> = [];
          try {
            const { data: routerRow, error: routerError } = await supabaseAdmin
              .from("router_connections")
              .select("owner_id")
              .eq("id", routerId)
              .maybeSingle();
            if (routerError) throw new Error(routerError.message);
            if (!routerRow?.owner_id) throw new Error("Router ownership could not be verified");
            const tenantCodes = (list ?? []).filter((c) => c.owner_id === routerRow.owner_id);
            const conn = await loadRouterConnForOwner(supabaseAdmin, routerId, routerRow.owner_id);
            users = (await routerAPI.users(conn)) ?? [];
            active = (await routerAPI.activeUsers(conn)) ?? [];

            const { markFirstUsesFromHotspot } = await import("@/lib/voucher-activation.server");
            const { activations } = await markFirstUsesFromHotspot({
              supabaseAdmin,
              routerId,
              users,
              active,
              codes: tenantCodes as never,
              nowMs: now,
            });
            const activated = new Map(activations.map((a) => [a.id, a]));
            summary.synced += activations.length;

            for (const c of tenantCodes ?? []) {
              const extra = activated.get(c.id);
              const u = users.find((x) => x["name"] === c.code);
              const a = active.find((x) => x["user"] === c.code);
              const mac =
                extra?.device_mac ??
                a?.["mac-address"] ??
                u?.["mac-address"] ??
                c.device_mac ??
                null;
              if (mac && !c.device_mac && !extra) {
                await supabaseAdmin
                  .from("voucher_codes")
                  .update({ device_mac: mac } as never)
                  .eq("id", c.id);
                summary.synced++;
              }

              const terminal = enforcementTarget({
                voucher: { ...c, router_id: routerId },
                routerId,
                users,
                active,
                now,
              });
              if (!terminal) continue;
              try {
                const outcome = await enforceVoucherTarget({
                  conn,
                  target: terminal.target,
                  removeActive: routerAPI.removeActive,
                  patchUser: routerAPI.patchUser,
                });
                if (outcome === "targeted") {
                  if (terminal.target.activeId) summary.activeSessionsTerminated++;
                  if (terminal.target.userId && !terminal.target.userDisabled)
                    summary.routerUsersDisabled++;
                }
                await recordRouterOp({
                  userId: c.owner_id,
                  ownerId: c.owner_id,
                  routerId,
                  action: "voucher_enforcement",
                  outcome: "ok",
                  detail: `${terminal.reason} voucher ${c.id}: ${outcome}`,
                });
              } catch (error) {
                summary.enforcementPending++;
                await recordRouterOp({
                  userId: c.owner_id,
                  ownerId: c.owner_id,
                  routerId,
                  action: "voucher_enforcement",
                  outcome: "failed",
                  detail: `${terminal.reason} voucher ${c.id}: enforcement pending`,
                  error,
                });
                continue;
              }
              if (terminal.reason === "expired") {
                await supabaseAdmin
                  .from("voucher_codes")
                  .update({ status: "expired" })
                  .eq("id", c.id)
                  .eq("owner_id", c.owner_id)
                  .eq("router_id", routerId);
                summary.expired++;
              }
            }
          } catch (error) {
            // Router unreachable — retain the existing ledger expiry behavior,
            // but never claim enforcement; retry the RouterOS action later.
            summary.enforcementPending += list?.length ?? 0;
            for (const c of list ?? []) {
              if (c.expires_at && new Date(c.expires_at).getTime() <= now) {
                await supabaseAdmin
                  .from("voucher_codes")
                  .update({ status: "expired" })
                  .eq("id", c.id)
                  .eq("owner_id", c.owner_id)
                  .eq("router_id", routerId);
                summary.expired++;
              }
            }
            const ownerId = list?.[0]?.owner_id;
            if (ownerId) {
              await recordRouterOp({
                userId: ownerId,
                ownerId,
                routerId,
                action: "voucher_enforcement",
                outcome: "blocked",
                detail: "Router unreachable; terminal voucher enforcement pending",
                error,
              });
            }
          }
        }

        // ---- 3: Syslog AI retention (14 days) ----
        const { syslogRetentionCutoff } = await import("@/lib/syslog-ingest.server");
        const syslogCutoff = syslogRetentionCutoff(new Date(now));
        const { data: syslogPruned } = await supabaseAdmin
          .from("syslog_events")
          .delete()
          .lt("received_at", syslogCutoff)
          .select("id");
        const syslogDropped = syslogPruned?.length ?? 0;

        return Response.json({ ok: true, ...summary, syslogPruned: syslogDropped });
      },
    },
  },
});
