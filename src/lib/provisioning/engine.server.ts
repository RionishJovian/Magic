// Provisioning engine — server-only orchestration of the staged pipeline:
//
//   discover → plan → preflight → backup → apply → verify → (rollback)
//
// The engine never talks to a device directly; it goes through a
// ProvisioningTransport. Live applies use the RouterOS REST transport (which
// already routes through the Local Connector / WireGuard hub via loadRouterConn).
// SandboxTransport is the in-memory stand-in for unit tests only.

import { capabilitiesFor, parseOsVersion, planMultiWan } from "./multi-wan";
import { parseTag } from "./tags";
import { SandboxTransport } from "./sandbox";
import type {
  ApplyOutcome,
  DeviceSnapshot,
  MultiWanIntent,
  ProvisioningPlan,
  ProvisioningTransport,
  SnapshotRule,
} from "./types";

// --------------------------------------------------------------------------
// RouterOS REST transport
// --------------------------------------------------------------------------

type SupabaseLike = Parameters<(typeof import("@/lib/router-conn.server"))["loadRouterConn"]>[0];

export function createRouterOsTransport(supabase: SupabaseLike): ProvisioningTransport {
  const conn = async (routerId: string) => {
    const { loadRouterConn } = await import("@/lib/router-conn.server");
    return loadRouterConn(supabase, routerId);
  };

  return {
    name: "routeros-rest",

    async discover(routerId): Promise<DeviceSnapshot> {
      const { routerAPI } = await import("@/lib/mikrotik.server");
      const c = await conn(routerId);
      const [
        resR,
        ifsR,
        addrR,
        routeR,
        mangleR,
        natR,
        filterR,
        netwatchR,
        cloudR,
        tableR,
        dhcpR,
        pppoeR,
      ] = await Promise.allSettled([
        routerAPI.raw<Record<string, string>>(c, "/system/resource"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/interface"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/ip/address"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/ip/route"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/ip/firewall/mangle"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/ip/firewall/nat"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/ip/firewall/filter"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/tool/netwatch"),
        routerAPI.raw<Record<string, string>>(c, "/ip/cloud"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/routing/table"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/ip/dhcp-client"),
        routerAPI.raw<Array<Record<string, string>>>(c, "/interface/pppoe-client"),
      ]);

      const ok = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
        r.status === "fulfilled" ? r.value : fallback;

      const res = ok(resR, {} as Record<string, string>);
      const version = parseOsVersion(res["version"] ?? "");
      const ifs = ok(ifsR, [] as Array<Record<string, string>>);
      const routes = ok(routeR, [] as Array<Record<string, string>>);

      const rules: SnapshotRule[] = [];
      const collect = (section: string, rows: Array<Record<string, string>>) => {
        for (const row of rows) {
          if (!parseTag(row["comment"])) continue;
          rules.push({
            section,
            id: row[".id"],
            comment: row["comment"],
            detail: JSON.stringify(row),
          });
        }
      };
      collect("/ip/route", routes);
      collect("/ip/firewall/mangle", ok(mangleR, []));
      collect("/ip/firewall/nat", ok(natR, []));
      collect("/tool/netwatch", ok(netwatchR, []));
      collect("/routing/table", ok(tableR, []));
      collect("/ip/dhcp-client", ok(dhcpR, []));
      collect("/interface/pppoe-client", ok(pppoeR, []));

      return {
        routerId,
        identity: res["board-name"] ? String(res["board-name"]) : "router",
        boardName: String(res["board-name"] ?? "unknown"),
        version,
        capabilities: capabilitiesFor(version),
        interfaces: ifs.map((i) => ({
          name: String(i["name"] ?? ""),
          type: String(i["type"] ?? "unknown"),
          running: i["running"] === "true",
        })),
        addresses: ok(addrR, []).map((a) => ({
          iface: String(a["interface"] ?? ""),
          address: String(a["address"] ?? ""),
          dynamic: a["dynamic"] === "true",
        })),
        routes: routes.map((r) => ({
          dst: String(r["dst-address"] ?? ""),
          gateway: String(r["gateway"] ?? ""),
          distance: Number(r["distance"] ?? 0),
          comment: r["comment"],
          routingMark: r["routing-mark"] ?? r["routing-table"],
          dynamic: r["dynamic"] === "true",
          iface: interfaceFromImmediateGateway(r["immediate-gw"] ?? ""),
        })),
        dhcpClients: ok(dhcpR, []).map((d) => ({
          iface: String(d["interface"] ?? ""),
          addDefaultRoute: !["no", "false"].includes(String(d["add-default-route"] ?? "yes")),
          gateway: String(d["gateway"] ?? "") || undefined,
        })),
        pppoeClients: ok(pppoeR, []).map((p) => ({
          name: String(p["name"] ?? ""),
          addDefaultRoute: !["no", "false"].includes(String(p["add-default-route"] ?? "yes")),
        })),
        fastTrackRules: ok(filterR, [])
          .filter(
            (rule) =>
              rule["action"] === "fasttrack-connection" &&
              !["yes", "true"].includes(String(rule["disabled"] ?? "false")),
          )
          .map((rule) => ({
            section: "/ip/firewall/filter",
            id: rule[".id"],
            comment: rule["comment"],
            detail: JSON.stringify(rule),
          })),
        rules,
        managementIface: managementIfaceFrom(routes),
        publicAddress: ok(cloudR, {} as Record<string, string>)["public-address"] ?? null,
        sandbox: false,
        takenAt: new Date().toISOString(),
      };
    },

    async backup(routerId, label) {
      const { routerAPI } = await import("@/lib/mikrotik.server");
      const c = await conn(routerId);
      const name = `mmagic-${label}`.slice(0, 40);
      await routerAPI.execScript(c, `/system backup save name=${name}`);
      return { id: name, name: `${name}.backup` };
    },

    async run(routerId, commands) {
      const { routerAPI } = await import("@/lib/mikrotik.server");
      const c = await conn(routerId);
      const out = [];
      for (const command of commands) {
        try {
          await routerAPI.execScript(c, command);
          out.push({ ok: true, command });
        } catch (e) {
          out.push({ ok: false, command, error: e instanceof Error ? e.message : String(e) });
          break; // stop at the first failure; the caller decides about rollback
        }
      }
      return out;
    },

    async verify(routerId) {
      const snap = await this.discover(routerId);
      const presentTags = snap.rules
        .map((r) => parseTag(r.comment))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .map((t) => `mmagic:${t.intent}:${t.hash}`);
      return { presentTags };
    },

    async restore(routerId, backupId) {
      const { routerAPI } = await import("@/lib/mikrotik.server");
      try {
        const c = await conn(routerId);
        await routerAPI.execScript(c, `/system backup load name=${backupId}`);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/** The default route's interface is our best guess at the management path. */
function managementIfaceFrom(routes: Array<Record<string, string>>): string | null {
  const def = routes.find((r) => (r["dst-address"] ?? "") === "0.0.0.0/0" && !r["routing-mark"]);
  const gwIface = def?.["immediate-gw"] ?? def?.["gateway"] ?? "";
  const m = /%([A-Za-z0-9._-]+)/.exec(gwIface);
  if (m) return m[1]!;
  return /^[A-Za-z]/.test(gwIface) ? gwIface : null;
}

function interfaceFromImmediateGateway(value: string): string | undefined {
  const m = /%([A-Za-z0-9._-]+)/.exec(value);
  if (m) return m[1];
  return /^[A-Za-z]/.test(value) ? value : undefined;
}

export function createSandboxTransport(
  options?: ConstructorParameters<typeof SandboxTransport>[0],
) {
  return new SandboxTransport(options);
}

// --------------------------------------------------------------------------
// Pipeline
// --------------------------------------------------------------------------

export async function planIntent(
  transport: ProvisioningTransport,
  intent: MultiWanIntent,
): Promise<{ snapshot: DeviceSnapshot; plan: ProvisioningPlan }> {
  const snapshot = await transport.discover(intent.routerId);
  return { snapshot, plan: planMultiWan(intent, snapshot) };
}

export type ApplyOptions = {
  /** Refuse to apply when the plan has blockers (default true). */
  respectBlockers?: boolean;
  /** Skip the pre-apply backup (unit tests only). */
  skipBackup?: boolean;
  /** Refuse to apply when inputs changed after the operator reviewed the dry run. */
  reviewedIntentHash?: string;
};

export async function applyIntent(
  transport: ProvisioningTransport,
  intent: MultiWanIntent,
  opts: ApplyOptions = {},
): Promise<{ plan: ProvisioningPlan; outcome: ApplyOutcome }> {
  const respectBlockers = opts.respectBlockers !== false;
  const { plan } = await planIntent(transport, intent);

  const base: ApplyOutcome = {
    ok: false,
    intentHash: plan.intentHash,
    backup: null,
    executed: [],
    verified: false,
    missingTags: [],
    rolledBack: false,
    sandbox: plan.sandbox,
  };

  if (opts.reviewedIntentHash && opts.reviewedIntentHash !== plan.intentHash) {
    return {
      plan,
      outcome: {
        ...base,
        error: "The Multi-WAN inputs changed after review. Build and review a new dry run.",
      },
    };
  }

  if (plan.blocked && respectBlockers) {
    return {
      plan,
      outcome: { ...base, error: "Preflight blockers must be resolved before applying." },
    };
  }
  if (plan.noop) {
    return { plan, outcome: { ...base, ok: true, verified: true } };
  }

  const backup = opts.skipBackup
    ? null
    : await transport.backup(intent.routerId, `${plan.intentKind}-${plan.intentHash}`);

  const commands = plan.steps.filter((s) => s.action !== "skip").map((s) => s.command);
  const executed = await transport.run(intent.routerId, commands);
  const failed = executed.find((r) => !r.ok);

  if (failed) {
    let rolledBack = false;
    if (backup) {
      const restored = await transport.restore(intent.routerId, backup.id);
      rolledBack = restored.ok;
    }
    return {
      plan,
      outcome: { ...base, backup, executed, rolledBack, error: failed.error ?? "apply failed" },
    };
  }

  const expected = plan.steps.filter((s) => s.action !== "remove").map((s) => s.tag);
  const { presentTags } = await transport.verify(intent.routerId, expected);
  const missingTags = expected.filter((t) => !presentTags.includes(t));

  if (missingTags.length > 0 && backup) {
    const restored = await transport.restore(intent.routerId, backup.id);
    return {
      plan,
      outcome: {
        ...base,
        backup,
        executed,
        missingTags,
        rolledBack: restored.ok,
        error: "Verification failed after apply — configuration was restored from backup.",
      },
    };
  }

  return {
    plan,
    outcome: {
      ...base,
      ok: true,
      backup,
      executed,
      verified: missingTags.length === 0,
      missingTags,
    },
  };
}
