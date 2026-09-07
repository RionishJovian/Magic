import { createFileRoute, Link } from "@tanstack/react-router";
import { DeviceLimitCard } from "@/components/DeviceLimitCard";
import { useT } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listApControllers,
  saveApController,
  deleteApController,
  testApController,
  listAps,
  listApClients,
  listApSsids,
  listApRadios,
  listApAlarms,
  listApTraffic,
  saveApSsid,
  setApSsidEnabled,
  setApSsidPassword,
  setApSsidVlan,
  setApRadio,
  rebootAp,
  apClientAction,
} from "@/lib/access-points.functions";
import { listSites } from "@/lib/sites.functions";
import { listConnectors } from "@/lib/connectors.functions";
import { listRouters } from "@/lib/routers.functions";
import { getMe } from "@/lib/auth.functions";
import { useSelectedSite } from "@/hooks/useSelectedSite";
import { toErrorMessage } from "@/lib/error-message";
import {
  AP_BRANDS,
  AP_BRAND_LABEL,
  CAPABILITY_LABEL,
  type ApBrand,
  type ApCapability,
} from "@/lib/ap/types";

export const Route = createFileRoute("/_authenticated/app/access-points")({
  head: () => ({
    meta: [
      { title: "Optional AP integrations — MikroTik Magic" },
      {
        name: "description",
        content:
          "Optional controller integrations that expose only capabilities returned by a successful Test. External bridge-mode APs can remain in their native vendor app.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccessPointsPage,
});

const BRAND_DEFAULT_PORT: Record<ApBrand, number> = {
  unifi: 443,
  mikrotik: 443,
  ruijie: 443,
  generic: 443,
};

const fmtMb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

function AccessPointsPage() {
  const t = useT();
  const qc = useQueryClient();
  const fetchMe = useServerFn(getMe);
  const fetchSites = useServerFn(listSites);
  const fetchConnectors = useServerFn(listConnectors);
  const fetchRouters = useServerFn(listRouters);
  const list = useServerFn(listApControllers);
  const save = useServerFn(saveApController);
  const remove = useServerFn(deleteApController);
  const test = useServerFn(testApController);

  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => fetchSites() });
  const connectors = useQuery({ queryKey: ["connectors"], queryFn: () => fetchConnectors() });
  const routers = useQuery({ queryKey: ["routers"], queryFn: () => fetchRouters() });
  const controllers = useQuery({
    queryKey: ["ap-controllers"],
    queryFn: () => list(),
  });
  const { site: selectedSite } = useSelectedSite();

  const canEdit = !(me.data?.roles?.includes("read_only") || me.data?.roles?.includes("expired"));

  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    brand: "unifi" as ApBrand,
    name: "",
    host: "",
    port: 443,
    unifi_site: "default",
    username: "",
    password: "",
    is_unifi_os: true,
    allow_insecure_tls: true,
    api_base_path: "" as string,
    router_id: null as string | null,
    site_id: null as string | null,
    connector_id: null as string | null,
  });

  const saveMut = useMutation({
    mutationFn: (v: typeof draft) =>
      save({
        data: {
          brand: v.brand,
          name: v.name,
          host: v.host,
          port: v.port,
          unifi_site: v.unifi_site,
          username: v.username || "-",
          password: v.password,
          is_unifi_os: v.is_unifi_os,
          allow_insecure_tls: v.allow_insecure_tls,
          api_base_path: v.api_base_path || null,
          router_id: v.router_id,
          site_id: v.site_id,
          connector_id: v.connector_id,
        },
      }),
    onSuccess: () => {
      toast.success("Controller saved — run Test to detect its features.");
      qc.invalidateQueries({ queryKey: ["ap-controllers"] });
      setDraft({ ...draft, name: "", host: "", username: "", password: "" });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (r) => {
      if (r.ok)
        toast.success(
          `Reachable — ${r.capabilities.length} feature${r.capabilities.length === 1 ? "" : "s"} available.`,
        );
      else toast.error(r.error ?? "Unreachable");
      qc.invalidateQueries({ queryKey: ["ap-controllers"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Controller removed");
      qc.invalidateQueries({ queryKey: ["ap-controllers"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const visible = (controllers.data ?? []).filter((c) =>
    selectedSite ? c.site_id === selectedSite.id : true,
  );

  const isMikrotik = draft.brand === "mikrotik";
  const isUnifi = draft.brand === "unifi";
  const isRuijie = draft.brand === "ruijie";

  return (
    <div className="space-y-6">
      <style>{`.ap-input{border:1px solid var(--color-border);background:var(--color-surface);padding:.5rem .75rem;border-radius:.375rem;font-size:.875rem;color:inherit;}`}</style>
      <header>
        <h1 className="text-2xl font-semibold">{t.label("Optional AP integrations")}</h1>
        <p className="text-sm text-muted-foreground">
          {t.copy(
            "Advanced controller links. Connect only a controller you intend to manage from MikroTik Magic; native vendor apps remain the default for other access points.",
          )}
          {selectedSite && ` · Filtered by site: ${selectedSite.name}`}
        </p>
      </header>

      <section className="rounded-2xl border border-emerald-500/35 bg-emerald-500/5 p-4">
        <h2 className="text-sm font-semibold text-foreground">
          {t.label("Not required for hotspot operation")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.copy(
            "For most installations, configure each external AP in its native app as AP or bridge mode, turn off DHCP and NAT, and connect it to a Hotspot LAN port. MikroTik Magic manages the RouterOS gateway, DHCP, Hotspot, vouchers and captive portal.",
          )}
        </p>
        <Link
          to="/app/routers"
          className="mt-3 inline-flex rounded-md border border-primary/50 bg-surface px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          {t.label("Set up external AP ports")}
        </Link>
      </section>
      <DeviceLimitCard kind="controllers" />

      {canEdit && (
        <section className="glass-panel rounded-2xl p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t.label("Connect an optional controller")}
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              className="ap-input"
              aria-label="Brand"
              value={draft.brand}
              onChange={(e) => {
                const brand = e.target.value as ApBrand;
                setDraft({
                  ...draft,
                  brand,
                  port: BRAND_DEFAULT_PORT[brand],
                  api_base_path: brand === "ruijie" ? "/api" : brand === "generic" ? "/api/v1" : "",
                });
              }}
            >
              {AP_BRANDS.map((b) => (
                <option key={b} value={b}>
                  {AP_BRAND_LABEL[b]}
                </option>
              ))}
            </select>
            <input
              className="ap-input"
              placeholder="Name (e.g. HQ Wi-Fi)"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            {isMikrotik ? (
              <select
                className="ap-input"
                aria-label="Managing router"
                value={draft.router_id ?? ""}
                onChange={(e) => setDraft({ ...draft, router_id: e.target.value || null })}
              >
                <option value="">Choose the managing router…</option>
                {routers.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.host})
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="ap-input"
                placeholder="Host (controller.example.com)"
                value={draft.host}
                onChange={(e) => setDraft({ ...draft, host: e.target.value })}
              />
            )}
            {!isMikrotik && (
              <>
                <input
                  className="ap-input"
                  type="number"
                  aria-label="Port"
                  placeholder="Port"
                  value={draft.port}
                  onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 443 })}
                />
                <input
                  className="ap-input"
                  placeholder="Username"
                  value={draft.username}
                  onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                />
                <input
                  className="ap-input"
                  type="password"
                  placeholder="Password"
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                />
              </>
            )}
            {isUnifi && (
              <>
                <input
                  className="ap-input"
                  placeholder="UniFi site (default)"
                  value={draft.unifi_site}
                  onChange={(e) => setDraft({ ...draft, unifi_site: e.target.value })}
                />
                <select
                  className="ap-input"
                  aria-label="Controller type"
                  value={draft.is_unifi_os ? "unifios" : "classic"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      is_unifi_os: e.target.value === "unifios",
                      port: e.target.value === "unifios" ? 443 : 8443,
                    })
                  }
                >
                  <option value="unifios">UniFi OS (Dream Machine / CloudKey Gen2+)</option>
                  <option value="classic">Classic Controller (self-hosted)</option>
                </select>
              </>
            )}
            {(draft.brand === "ruijie" || draft.brand === "generic") && (
              <input
                className="ap-input"
                placeholder="API base path (e.g. /api)"
                value={draft.api_base_path}
                onChange={(e) => setDraft({ ...draft, api_base_path: e.target.value })}
              />
            )}
            <select
              className="ap-input"
              aria-label="Connection method"
              value={draft.connector_id ?? ""}
              onChange={(e) => setDraft({ ...draft, connector_id: e.target.value || null })}
            >
              <option value="">Cloud / Direct</option>
              {connectors.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  Local Connector — {c.name}
                  {c.online ? "" : " (offline)"}
                </option>
              ))}
            </select>
            <select
              className="ap-input"
              aria-label="Site"
              value={draft.site_id ?? ""}
              onChange={(e) => setDraft({ ...draft, site_id: e.target.value || null })}
            >
              <option value="">No site</option>
              {sites.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              disabled={
                !draft.name ||
                saveMut.isPending ||
                (isMikrotik ? !draft.router_id : !draft.host || !draft.username || !draft.password)
              }
              onClick={() => saveMut.mutate(draft)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saveMut.isPending ? "Saving…" : "Add controller"}
            </button>
          </div>
          {isRuijie && (
            <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-100">
              {t.copy(
                "Ruijie/Reyee support here is for a reachable local EWEB gateway or AP master. Do not enter Ruijie Cloud account credentials.",
              )}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {t.copy(
              "Run Test before using any write controls. MikroTik Magic exposes only the capabilities returned by that controller. Private-LAN controllers require a paired Local Connector.",
            )}
          </p>
        </section>
      )}

      <section className="space-y-3">
        {controllers.isLoading && (
          <p className="text-sm text-muted-foreground">{t.copy("Loading…")}</p>
        )}
        {visible.length === 0 && !controllers.isLoading && (
          <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {t.copy(
              "No controller integrations connected. This is normal when access points are managed in their native apps.",
            )}
          </div>
        )}

        {visible.map((c) => (
          <article key={c.id} className="glass-panel rounded-2xl p-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{c.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {AP_BRAND_LABEL[(c.brand ?? "unifi") as ApBrand]}
                  {c.brand === "mikrotik" ? " · via managed router" : ` · ${c.host}:${c.port}`}
                  {c.brand === "unifi" && ` · site "${c.unifi_site}"`}
                </p>
                {c.capabilities?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(c.capabilities as ApCapability[]).map((cap) => (
                      <span
                        key={cap}
                        className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {CAPABILITY_LABEL[cap] ?? cap}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => testMut.mutate(c.id)}
                  disabled={testMut.isPending}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
                >
                  {testMut.isPending ? "Testing…" : "Test"}
                </button>
                <button
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
                >
                  {expanded === c.id ? "Hide" : "Manage"}
                </button>
                {canEdit && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Remove controller "${c.name}"?`)) removeMut.mutate(c.id);
                    }}
                    className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/10"
                  >
                    Remove
                  </button>
                )}
              </div>
            </header>
            {expanded === c.id && (
              <ControllerConsole
                controllerId={c.id}
                brand={(c.brand ?? "unifi") as ApBrand}
                canEdit={canEdit}
              />
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

const TABS = ["aps", "clients", "ssids", "radios", "alarms", "traffic"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  aps: "Access points",
  clients: "Clients",
  ssids: "SSIDs",
  radios: "Radios",
  alarms: "Alarms",
  traffic: "Traffic",
};

function ControllerConsole({
  controllerId,
  brand,
  canEdit,
}: {
  controllerId: string;
  brand: ApBrand;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("aps");
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "border border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === "aps" && <ApsTab controllerId={controllerId} canEdit={canEdit} />}
      {tab === "clients" && <ClientsTab controllerId={controllerId} canEdit={canEdit} />}
      {tab === "ssids" && <SsidsTab controllerId={controllerId} canEdit={canEdit} brand={brand} />}
      {tab === "radios" && <RadiosTab controllerId={controllerId} canEdit={canEdit} />}
      {tab === "alarms" && <AlarmsTab controllerId={controllerId} />}
      {tab === "traffic" && <TrafficTab controllerId={controllerId} />}
    </div>
  );
}

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-200">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

function ApsTab({ controllerId, canEdit }: { controllerId: string; canEdit: boolean }) {
  const t = useT();
  const fn = useServerFn(listAps);

  const reboot = useServerFn(rebootAp);
  const q = useQuery({
    queryKey: ["ap-devices", controllerId],
    queryFn: () => fn({ data: { id: controllerId } }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const rebootMut = useMutation({
    mutationFn: (v: { ref: string; mac: string }) => reboot({ data: { id: controllerId, ...v } }),
    onSuccess: () => toast.success("Reboot requested"),
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  return (
    <div className="space-y-2">
      <ErrorNote error={q.error} />
      {q.isLoading && (
        <p className="text-xs text-muted-foreground">{t.copy("Loading access points…")}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {q.data?.map((d) => (
          <div key={d.mac} className="rounded-md border border-border/50 bg-surface/50 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{d.name ?? d.mac}</span>
              <span
                className={
                  d.state === "online"
                    ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300"
                    : "rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] text-red-300"
                }
              >
                {d.state}
              </span>
            </div>
            <div className="mt-1 text-muted-foreground">
              {d.model ?? "—"} · {d.clients} clients {d.version ? `· v${d.version}` : ""}
            </div>
            <div className="text-muted-foreground">
              {d.ip ?? "—"} · CPU {d.cpu_pct ?? "—"}% · MEM {d.mem_pct ?? "—"}%
            </div>
            {canEdit && d.ref && (
              <button
                onClick={() => {
                  if (window.confirm(`Reboot "${d.name ?? d.mac}"?`))
                    rebootMut.mutate({ ref: d.ref!, mac: d.mac });
                }}
                className="mt-2 rounded border border-amber-500/40 px-2 py-0.5 text-amber-200 hover:bg-amber-500/10"
              >
                Reboot
              </button>
            )}
          </div>
        ))}
      </div>
      {q.data?.length === 0 && !q.isLoading && (
        <p className="text-xs text-muted-foreground">{t.copy("No access points reported.")}</p>
      )}
    </div>
  );
}

function ClientsTab({ controllerId, canEdit }: { controllerId: string; canEdit: boolean }) {
  const t = useT();
  const fn = useServerFn(listApClients);

  const act = useServerFn(apClientAction);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ap-clients", controllerId],
    queryFn: () => fn({ data: { id: controllerId } }),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
  const doAct = useMutation({
    mutationFn: (v: { mac: string; action: "block" | "unblock" | "reconnect" }) =>
      act({ data: { id: controllerId, ...v } }),
    onSuccess: (_r, v) => {
      toast.success(`${v.action} ${v.mac}`);
      qc.invalidateQueries({ queryKey: ["ap-clients", controllerId] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  return (
    <div className="space-y-2">
      <ErrorNote error={q.error} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2">Host</th>
              <th className="py-1 pr-2">IP</th>
              <th className="py-1 pr-2">MAC</th>
              <th className="py-1 pr-2">SSID</th>
              <th className="py-1 pr-2">Signal</th>
              <th className="py-1 pr-2">RX/TX</th>
              {canEdit && <th className="py-1 pr-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {q.data?.map((c) => (
              <tr key={c.mac} className="border-t border-border/40">
                <td className="py-1 pr-2">{c.hostname ?? "—"}</td>
                <td className="py-1 pr-2">{c.ip ?? "—"}</td>
                <td className="py-1 pr-2 font-mono">{c.mac}</td>
                <td className="py-1 pr-2">{c.ssid ?? "—"}</td>
                <td className="py-1 pr-2">{c.signal ?? "—"}</td>
                <td className="py-1 pr-2">
                  {fmtMb(c.rx_bytes)} / {fmtMb(c.tx_bytes)}
                </td>
                {canEdit && (
                  <td className="py-1 pr-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => doAct.mutate({ mac: c.mac, action: "reconnect" })}
                        className="rounded border border-border px-2 py-0.5 hover:border-primary hover:text-primary"
                      >
                        Kick
                      </button>
                      {c.blocked ? (
                        <button
                          onClick={() => doAct.mutate({ mac: c.mac, action: "unblock" })}
                          className="rounded border border-green-500/40 px-2 py-0.5 text-green-200 hover:bg-green-500/10"
                        >
                          Unblock
                        </button>
                      ) : (
                        <button
                          onClick={() => doAct.mutate({ mac: c.mac, action: "block" })}
                          className="rounded border border-red-500/40 px-2 py-0.5 text-red-200 hover:bg-red-500/10"
                        >
                          Block
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.data?.length === 0 && !q.isLoading && (
        <p className="text-xs text-muted-foreground">{t.copy("No wireless clients connected.")}</p>
      )}
    </div>
  );
}

function SsidsTab({
  controllerId,
  canEdit,
  brand,
}: {
  controllerId: string;
  canEdit: boolean;
  brand: ApBrand;
}) {
  const t = useT();
  const qc = useQueryClient();

  const fn = useServerFn(listApSsids);
  const saveFn = useServerFn(saveApSsid);
  const enableFn = useServerFn(setApSsidEnabled);
  const passFn = useServerFn(setApSsidPassword);
  const vlanFn = useServerFn(setApSsidVlan);

  const q = useQuery({
    queryKey: ["ap-ssids", controllerId],
    queryFn: () => fn({ data: { id: controllerId } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ap-ssids", controllerId] });

  const [newSsid, setNewSsid] = useState({ name: "", password: "", vlan: "" });
  const [pwDraft, setPwDraft] = useState<Record<string, string>>({});
  const [vlanDraft, setVlanDraft] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: controllerId,
          name: newSsid.name,
          password: newSsid.password || null,
          vlan: newSsid.vlan ? Number(newSsid.vlan) : null,
          enabled: true,
        },
      }),
    onSuccess: () => {
      toast.success("SSID created");
      setNewSsid({ name: "", password: "", vlan: "" });
      invalidate();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: (v: { ref: string; enabled: boolean }) =>
      enableFn({ data: { id: controllerId, ...v } }),
    onSuccess: () => {
      toast.success("SSID updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const setPw = useMutation({
    mutationFn: (v: { ref: string; password: string }) =>
      passFn({ data: { id: controllerId, ...v } }),
    onSuccess: (_r, v) => {
      toast.success("Wi-Fi password changed");
      setPwDraft((d) => ({ ...d, [v.ref]: "" }));
      invalidate();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const setVlan = useMutation({
    mutationFn: (v: { ref: string; vlan: number | null }) =>
      vlanFn({ data: { id: controllerId, ...v } }),
    onSuccess: () => {
      toast.success("VLAN updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  return (
    <div className="space-y-3">
      {brand === "mikrotik" && (
        <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-xs">
          <p className="font-semibold text-foreground">Guest hotspot Wi‑Fi lives on Routers</p>
          <p className="mt-1 text-muted-foreground">
            Open guest SSIDs (captive portal, no password) are set up on{" "}
            <strong className="text-foreground">Routers → Hotspot Wi‑Fi (SSID)</strong>, not here.
            This tab is for WPA staff networks via CAPsMAN / legacy wireless only.
          </p>
          <Link
            to="/app/routers"
            className="mt-2 inline-flex rounded-md border border-primary/50 bg-surface px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10"
          >
            Open Routers → Hotspot Wi‑Fi
          </Link>
        </div>
      )}
      <ErrorNote error={q.error} />
      {canEdit && brand !== "generic" && brand !== "mikrotik" && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/50 p-3">
          <input
            className="ap-input"
            placeholder="New SSID name"
            value={newSsid.name}
            onChange={(e) => setNewSsid({ ...newSsid, name: e.target.value })}
          />
          <input
            className="ap-input"
            type="password"
            placeholder="Password (min 8)"
            value={newSsid.password}
            onChange={(e) => setNewSsid({ ...newSsid, password: e.target.value })}
          />
          <input
            className="ap-input w-24"
            placeholder="VLAN"
            value={newSsid.vlan}
            onChange={(e) => setNewSsid({ ...newSsid, vlan: e.target.value })}
          />
          <button
            disabled={!newSsid.name || create.isPending}
            onClick={() => create.mutate()}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create SSID"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {q.data?.map((s) => (
          <div key={s.ref} className="rounded-md border border-border/50 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-sm font-semibold">{s.name}</span>
                <span className="ml-2 text-muted-foreground">
                  {s.security ?? "—"} · VLAN {s.vlan ?? "none"} · {s.band ?? "all bands"}
                  {s.hidden ? " · hidden" : ""}
                </span>
              </div>
              <span
                className={
                  s.enabled
                    ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300"
                    : "rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] text-muted-foreground"
                }
              >
                {s.enabled ? "enabled" : "disabled"}
              </span>
            </div>
            {canEdit && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => toggle.mutate({ ref: s.ref, enabled: !s.enabled })}
                  className="rounded border border-border px-2 py-1 hover:border-primary hover:text-primary"
                >
                  {s.enabled ? "Disable" : "Enable"}
                </button>
                <input
                  className="ap-input"
                  type="password"
                  placeholder="New Wi-Fi password"
                  value={pwDraft[s.ref] ?? ""}
                  onChange={(e) => setPwDraft({ ...pwDraft, [s.ref]: e.target.value })}
                />
                <button
                  disabled={(pwDraft[s.ref] ?? "").length < 8}
                  onClick={() => setPw.mutate({ ref: s.ref, password: pwDraft[s.ref]! })}
                  className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:border-primary hover:text-primary"
                >
                  Change password
                </button>
                <input
                  className="ap-input w-20"
                  placeholder="VLAN"
                  value={vlanDraft[s.ref] ?? (s.vlan != null ? String(s.vlan) : "")}
                  onChange={(e) => setVlanDraft({ ...vlanDraft, [s.ref]: e.target.value })}
                />
                <button
                  onClick={() =>
                    setVlan.mutate({
                      ref: s.ref,
                      vlan: (vlanDraft[s.ref] ?? "").trim() ? Number(vlanDraft[s.ref]) : null,
                    })
                  }
                  className="rounded border border-border px-2 py-1 hover:border-primary hover:text-primary"
                >
                  Save VLAN
                </button>
              </div>
            )}
          </div>
        ))}
        {q.data?.length === 0 && !q.isLoading && (
          <p className="text-xs text-muted-foreground">{t.copy("No SSIDs reported.")}</p>
        )}
      </div>
    </div>
  );
}

function RadiosTab({ controllerId, canEdit }: { controllerId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const fn = useServerFn(listApRadios);
  const setFn = useServerFn(setApRadio);
  const q = useQuery({
    queryKey: ["ap-radios", controllerId],
    queryFn: () => fn({ data: { id: controllerId } }),
  });
  const [draft, setDraft] = useState<
    Record<string, { channel: string; width: string; power: string }>
  >({});
  const apply = useMutation({
    mutationFn: (v: { ref: string; channel: string; width: string; tx_power: string }) =>
      setFn({
        data: {
          id: controllerId,
          ref: v.ref,
          channel: v.channel || null,
          width: v.width || null,
          tx_power: v.tx_power || null,
        },
      }),
    onSuccess: () => {
      toast.success("Radio updated");
      qc.invalidateQueries({ queryKey: ["ap-radios", controllerId] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  return (
    <div className="space-y-2">
      <ErrorNote error={q.error} />
      {q.data?.map((r) => {
        const d = draft[r.ref] ?? { channel: "", width: "", power: "" };
        return (
          <div key={r.ref} className="rounded-md border border-border/50 p-3 text-xs">
            <div className="text-muted-foreground">
              <span className="text-sm font-semibold text-foreground">{r.band ?? "radio"}</span> ·{" "}
              {r.ap_mac ?? "—"} · channel {r.channel ?? "auto"} · width {r.width ?? "—"} · power{" "}
              {r.tx_power ?? "—"}
            </div>
            {canEdit && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className="ap-input w-24"
                  placeholder="Channel"
                  value={d.channel}
                  onChange={(e) =>
                    setDraft({ ...draft, [r.ref]: { ...d, channel: e.target.value } })
                  }
                />
                <input
                  className="ap-input w-24"
                  placeholder="Width"
                  value={d.width}
                  onChange={(e) => setDraft({ ...draft, [r.ref]: { ...d, width: e.target.value } })}
                />
                <input
                  className="ap-input w-28"
                  placeholder="TX power"
                  value={d.power}
                  onChange={(e) => setDraft({ ...draft, [r.ref]: { ...d, power: e.target.value } })}
                />
                <button
                  disabled={!d.channel && !d.width && !d.power}
                  onClick={() =>
                    apply.mutate({
                      ref: r.ref,
                      channel: d.channel,
                      width: d.width,
                      tx_power: d.power,
                    })
                  }
                  className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:border-primary hover:text-primary"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        );
      })}
      {q.data?.length === 0 && !q.isLoading && (
        <p className="text-xs text-muted-foreground">No radios reported.</p>
      )}
    </div>
  );
}

function AlarmsTab({ controllerId }: { controllerId: string }) {
  const fn = useServerFn(listApAlarms);
  const q = useQuery({
    queryKey: ["ap-alarms", controllerId],
    queryFn: () => fn({ data: { id: controllerId } }),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  return (
    <div className="space-y-2">
      <ErrorNote error={q.error} />
      {q.data?.map((a) => (
        <div key={a.id} className="rounded-md border border-border/50 p-2 text-xs">
          <span
            className={
              /crit|error/i.test(a.severity)
                ? "mr-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] text-red-300"
                : "mr-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200"
            }
          >
            {a.severity}
          </span>
          <span className="text-muted-foreground">{a.at ?? ""}</span> {a.message}
        </div>
      ))}
      {q.data?.length === 0 && !q.isLoading && (
        <p className="text-xs text-muted-foreground">No alarms reported.</p>
      )}
    </div>
  );
}

function TrafficTab({ controllerId }: { controllerId: string }) {
  const fn = useServerFn(listApTraffic);
  const q = useQuery({
    queryKey: ["ap-traffic", controllerId],
    queryFn: () => fn({ data: { id: controllerId } }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const max = Math.max(1, ...(q.data ?? []).map((t) => t.rx_bytes + t.tx_bytes));
  return (
    <div className="space-y-2">
      <ErrorNote error={q.error} />
      {q.data?.map((t) => (
        <div key={t.label} className="text-xs">
          <div className="flex justify-between">
            <span>{t.label}</span>
            <span className="text-muted-foreground">
              ↓ {fmtMb(t.rx_bytes)} · ↑ {fmtMb(t.tx_bytes)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border/40">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${((t.rx_bytes + t.tx_bytes) / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {q.data?.length === 0 && !q.isLoading && (
        <p className="text-xs text-muted-foreground">No traffic counters reported.</p>
      )}
    </div>
  );
}
