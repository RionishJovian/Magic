import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import {
  listManagedDevices,
  saveManagedDevice,
  deleteManagedDevice,
  readDevicePorts,
  cyclePoePort,
} from "@/lib/inventory.functions";
import { listSites } from "@/lib/sites.functions";
import { listRouters } from "@/lib/routers.functions";
import { useSelectedSite } from "@/hooks/useSelectedSite";
import { getMe } from "@/lib/auth.functions";
import { meHasFeature } from "@/lib/operator-features";
import { DelayedFallback, SkeletonList } from "@/components/ui/skeleton";
import {
  ACTION_LABEL,
  CATEGORY_LABEL,
  DEVICE_CATEGORIES,
  DEVICE_TRANSPORTS,
  DEVICE_VENDORS,
  TRANSPORT_LABEL,
  VENDOR_LABEL,
  capabilitiesOf,
  type DeviceCategory,
  type DeviceTransport,
  type DeviceVendor,
} from "@/lib/devices/vendors";
import { poeCycleGuard, summarizePorts, type SwitchPort } from "@/lib/devices/ports";
import { toErrorMessage } from "@/lib/error-message";

export const Route = createFileRoute("/_authenticated/app/devices")({
  head: () => ({
    meta: [
      { title: "Devices & ports — MikroTik Magic" },
      {
        name: "description",
        content:
          "One inventory for MikroTik routers and switches, Ruijie, Cisco, TP-Link and UniFi gear, with link state, PoE and safe port power-cycling.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DevicesPage,
});

type DeviceRow = {
  id: string;
  name: string;
  vendor: DeviceVendor;
  category: DeviceCategory;
  transport: DeviceTransport;
  model: string | null;
  location: string | null;
  host: string | null;
  site_id: string | null;
  router_id: string | null;
};

const EMPTY = {
  name: "",
  vendor: "mikrotik" as DeviceVendor,
  category: "switch" as DeviceCategory,
  transport: "direct" as DeviceTransport,
  model: "",
  host: "",
  location: "",
  siteId: "",
  routerId: "",
};

function DevicesPage() {
  const t = useT();
  const qc = useQueryClient();
  const fetchDevices = useServerFn(listManagedDevices);
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: 5 * 60_000 });
  const canPoe = meHasFeature(me.data, "poe");
  const fetchSites = useServerFn(listSites);
  const fetchRouters = useServerFn(listRouters);
  const save = useServerFn(saveManagedDevice);
  const remove = useServerFn(deleteManagedDevice);

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const devices = useQuery({ queryKey: ["managed-devices"], queryFn: () => fetchDevices() });
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => fetchSites() });
  const routers = useQuery({ queryKey: ["routers"], queryFn: () => fetchRouters() });

  const saving = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...(editing ? { id: editing } : {}),
          name: form.name.trim(),
          vendor: form.vendor,
          category: form.category,
          transport: form.transport,
          model: form.model.trim() || null,
          host: form.host.trim() || null,
          location: form.location.trim() || null,
          siteId: form.siteId || null,
          routerId: form.routerId || null,
        },
      }),
    onSuccess: () => {
      toast.success(editing ? "Device updated" : "Device added");
      setForm(EMPTY);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["managed-devices"] });
      qc.invalidateQueries({ queryKey: ["business-snapshot"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const deleting = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Device removed");
      qc.invalidateQueries({ queryKey: ["managed-devices"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const { site: selectedSite } = useSelectedSite();
  const rows = useMemo(() => {
    const all = (devices.data ?? []) as unknown as DeviceRow[];
    if (!selectedSite) return all;
    return all.filter((d) => d.site_id === selectedSite.id);
  }, [devices.data, selectedSite]);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{t.label("Devices & ports")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t.copy(
            "Every switch, gateway and access point behind your router, in one list. Actions your hardware cannot do are shown as unavailable rather than failing.",
          )}
        </p>
      </header>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">
          {t.label(editing ? "Edit device" : "Add a device")}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Front desk switch"
            />
          </Field>
          <Field label="Vendor">
            <select
              className="input"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value as DeviceVendor })}
            >
              {DEVICE_VENDORS.map((v) => (
                <option key={v} value={v}>
                  {VENDOR_LABEL[v]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as DeviceCategory })}
            >
              {DEVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reached by">
            <select
              className="input"
              value={form.transport}
              onChange={(e) => setForm({ ...form, transport: e.target.value as DeviceTransport })}
            >
              {DEVICE_TRANSPORTS.map((tr) => (
                <option key={tr} value={tr}>
                  {TRANSPORT_LABEL[tr]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <input
              className="input"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="CRS328-24P-4S+"
            />
          </Field>
          <Field label="Address">
            <input
              className="input"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder="192.168.88.2"
            />
          </Field>
          <Field label="Site">
            <select
              className="input"
              value={form.siteId}
              onChange={(e) => setForm({ ...form, siteId: e.target.value })}
            >
              <option value="">No site</option>
              {(sites.data ?? []).map((s: { id: string; name: string }) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Managed through router">
            <select
              className="input"
              value={form.routerId}
              onChange={(e) => setForm({ ...form, routerId: e.target.value })}
            >
              <option value="">Not linked</option>
              {(routers.data ?? []).map((r: { id: string; name: string }) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <input
              className="input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Rack A, ground floor"
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!form.name.trim() || saving.isPending}
            onClick={() => saving.mutate()}
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {editing ? "Save changes" : "Add device"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
              }}
              className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--glass-border)] px-5 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-4">
        {devices.isLoading && (
          <DelayedFallback loading label="Loading devices" fallback={<SkeletonList rows={4} />} />
        )}
        {devices.isError && (
          <p className="text-sm text-red-300">
            {t.copy("We could not load your devices. Try again in a moment.")}
          </p>
        )}
        {!devices.isLoading && rows.length === 0 && (
          <p className="panel p-5 text-sm text-muted-foreground">
            {t.copy("No devices yet. Add the switches and access points behind your router.")}
          </p>
        )}
        {rows.map((d) => (
          <article key={d.id} className="panel p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <h3 className="break-words text-base font-semibold">{d.name}</h3>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {VENDOR_LABEL[d.vendor]} · {CATEGORY_LABEL[d.category]} ·{" "}
                  {TRANSPORT_LABEL[d.transport]}
                  {d.model ? ` · ${d.model}` : ""}
                  {d.location ? ` · ${d.location}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(open === d.id ? null : d.id)}
                  className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--glass-border)] px-4 text-xs"
                  aria-expanded={open === d.id}
                >
                  {open === d.id ? "Hide ports" : "Ports & PoE"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(d.id);
                    setForm({
                      name: d.name,
                      vendor: d.vendor,
                      category: d.category,
                      transport: d.transport,
                      model: d.model ?? "",
                      host: d.host ?? "",
                      location: d.location ?? "",
                      siteId: d.site_id ?? "",
                      routerId: d.router_id ?? "",
                    });
                  }}
                  className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--glass-border)] px-4 text-xs"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleting.mutate(d.id)}
                  className="inline-flex min-h-11 items-center rounded-full border border-red-500/40 px-4 text-xs text-red-300"
                >
                  Remove
                </button>
              </div>
            </div>

            <ul className="mt-4 flex flex-wrap gap-1.5">
              {capabilitiesOf(d).map((c) => (
                <li
                  key={c.action}
                  title={c.state.supported ? "Supported" : c.state.reason}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                    c.state.supported
                      ? "border-emerald-500/40 text-emerald-300"
                      : "border-border text-muted-foreground line-through"
                  }`}
                >
                  {ACTION_LABEL[c.action]}
                </li>
              ))}
            </ul>

            {open === d.id && <PortPanel device={d} canPoe={canPoe} />}
          </article>
        ))}
      </section>
    </div>
  );
}

function PortPanel({ device, canPoe }: { device: DeviceRow; canPoe: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const fetchPorts = useServerFn(readDevicePorts);
  const cycle = useServerFn(cyclePoePort);
  const [confirming, setConfirming] = useState<SwitchPort | null>(null);
  const [typed, setTyped] = useState("");

  const ports = useQuery({
    queryKey: ["device-ports", device.id],
    queryFn: () => fetchPorts({ data: { deviceId: device.id } }),
    retry: false,
  });

  const doCycle = useMutation({
    mutationFn: (port: SwitchPort) =>
      cycle({ data: { deviceId: device.id, portRef: port.ref, confirmation: typed } }),
    onSuccess: () => {
      toast.success("Port power-cycled");
      setConfirming(null);
      setTyped("");
      qc.invalidateQueries({ queryKey: ["device-ports", device.id] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  if (ports.isLoading)
    return <p className="mt-4 text-xs text-muted-foreground">{t.copy("Reading ports…")}</p>;

  if (ports.isError)
    return (
      <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        {(ports.error as Error).message}
      </p>
    );

  const view = ports.data;
  const s = summarizePorts(view);

  return (
    <div className="mt-4">
      <p className="text-xs text-muted-foreground">
        {s.up}/{s.total} {t.copy("links up")} · {s.poeOn} {t.copy("ports powered")} ·{" "}
        {s.usedWatts == null ? t.copy("PoE draw not reported") : `${s.usedWatts} W`} ·{" "}
        {t.copy("measured")} {new Date(view!.fetchedAt).toLocaleTimeString()}
      </p>
      <div className="table-scroll mt-3">
        <table className="w-full min-w-[820px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-28" />
            <col className="w-20" />
            <col className="w-24" />
            <col />
            <col className="w-16" />
            <col className="w-28" />
            <col className="w-32" />
          </colgroup>
          <thead className="text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap py-2 pr-3 font-medium">Port</th>
              <th className="whitespace-nowrap py-2 pr-3 font-medium">Link</th>
              <th className="whitespace-nowrap py-2 pr-3 font-medium">Speed</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="whitespace-nowrap py-2 pr-3 font-medium">VLAN</th>
              <th className="whitespace-nowrap py-2 pr-3 font-medium">PoE</th>
              <th className="py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {(view?.ports ?? []).map((p) => {
              const guard = poeCycleGuard(device, p);
              return (
                <tr key={p.ref} className="border-t border-[color:var(--glass-border)]">
                  <td className="whitespace-nowrap py-2 pr-3">{p.name}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{p.link}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {p.speedMbps == null ? "—" : `${p.speedMbps} Mb`}
                  </td>
                  <td className="break-words py-2 pr-3">{p.role}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{p.vlan ?? "—"}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {p.poe}
                    {p.poeWatts != null ? ` · ${p.poeWatts} W` : ""}
                  </td>
                  <td className="whitespace-nowrap py-2">
                    <button
                      type="button"
                      disabled={!guard.allowed || !canPoe}
                      title={
                        !canPoe
                          ? "Ask the app owner to grant PoE power on Users."
                          : guard.allowed
                            ? "Power-cycle this port"
                            : guard.reason
                      }
                      onClick={() => {
                        setConfirming(p);
                        setTyped("");
                      }}
                      className="inline-flex min-h-9 items-center rounded-full border border-[color:var(--glass-border)] px-3 text-[11px] disabled:opacity-40"
                    >
                      Power-cycle
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirming && (
        <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-xs text-amber-100">
            {t.copy("This cuts power to whatever is plugged into this port. Type the port name")}{" "}
            <strong>{confirming.name}</strong> {t.copy("to confirm.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="input max-w-xs"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Type the port name to confirm"
            />
            <button
              type="button"
              disabled={typed.trim() !== confirming.name || doCycle.isPending}
              onClick={() => doCycle.mutate(confirming)}
              className="inline-flex min-h-11 items-center rounded-full bg-red-500/80 px-5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Power-cycle
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--glass-border)] px-5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{t.label(label)}</span>
      {children}
    </label>
  );
}
