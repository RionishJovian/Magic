import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelectedSite } from "@/hooks/useSelectedSite";
import { fmtBytes, fmtRate } from "@/lib/format-traffic";
import { useT } from "@/lib/i18n";
import {
  listRouters,
  routerServiceCounts,
  routerTelemetry,
  routersStatus,
} from "@/lib/routers.functions";
import { ServiceCountsStrip } from "@/components/ServiceCountsStrip";

type Telemetry = Awaited<ReturnType<typeof routerTelemetry>>;

/**
 * Home dashboard: live RouterBoard telemetry directly under voucher revenue.
 * Picks the selected site's online router when possible.
 */
export function LiveTelemetryDashboard() {
  const tr = useT();
  const { site } = useSelectedSite();
  const fetchStatus = useServerFn(routersStatus);
  const fetchList = useServerFn(listRouters);
  const [selectedId, setSelectedId] = useState("");

  const status = useQuery({
    queryKey: ["routers-status"],
    queryFn: () => fetchStatus(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const list = useQuery({
    queryKey: ["routers"],
    queryFn: () => fetchList(),
    staleTime: 60_000,
  });

  const candidates = useMemo(() => {
    const routers = status.data?.routers ?? [];
    if (site && list.data) {
      const ids = new Set(list.data.filter((r) => r.site_id === site.id).map((r) => r.id));
      const scoped = routers.filter((r) => ids.has(r.id));
      if (scoped.length) return scoped;
    }
    return routers;
  }, [list.data, site, status.data?.routers]);

  useEffect(() => {
    if (selectedId && candidates.some((r) => r.id === selectedId)) return;
    const pick = candidates.find((r) => r.online) ?? candidates[0];
    setSelectedId(pick?.id ?? "");
  }, [candidates, selectedId]);

  const selected = candidates.find((r) => r.id === selectedId);

  return (
    <section
      aria-labelledby="live-telemetry-heading"
      className="glass-panel rounded-[1.75rem] p-5 sm:p-6"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h2 id="live-telemetry-heading" className="text-title truncate text-lg">
            {tr.label("Live telemetry")}
          </h2>
          <p className="text-sub mt-1 text-xs">
            {tr.copy("CPU, temperature and live traffic from the selected RouterBoard.")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {candidates.length > 1 && (
            <select
              id="home-telemetry-router"
              aria-label="Router"
              className="min-h-11 max-w-[12rem] rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-3 text-xs"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {candidates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.online ? "" : " (offline)"}
                </option>
              ))}
            </select>
          )}
          <Link
            to="/app/routers"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-4 text-xs font-medium transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Open routers
          </Link>
        </div>
      </div>

      {status.isLoading && !status.data ? (
        <p className="text-sub mt-4 text-xs">{tr.copy("Connecting…")}</p>
      ) : !selectedId ? (
        <p className="text-sub mt-4 text-sm">
          {tr.copy("Add a RouterBoard to see live CPU, traffic and interface stats.")}
        </p>
      ) : (
        <div className="mt-4">
          {selected && candidates.length === 1 && (
            <p className="text-kicker mb-3 text-[11px] uppercase tracking-wide">
              {selected.name}
              {selected.online ? "" : " · offline"}
            </p>
          )}
          <TelemetryBody key={selectedId} routerId={selectedId} active showInterfaceList={false} />
        </div>
      )}
    </section>
  );
}

/** Collapsible per-router panel used on the Routers page. */
export function LiveTelemetryPanel({ routerId }: { routerId: string }) {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(false);

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/20">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${online ? "bg-success animate-pulse" : "bg-muted-foreground"}`}
          />
          Live telemetry
        </span>
        <span className="text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-border p-3 text-xs">
          <TelemetryBody
            routerId={routerId}
            active={open}
            pauseWhenOffscreen={false}
            onOnline={setOnline}
          />
        </div>
      )}
    </div>
  );
}

function TelemetryBody({
  routerId,
  active,
  pauseWhenOffscreen = true,
  showInterfaceList = true,
  onOnline,
}: {
  routerId: string;
  active: boolean;
  pauseWhenOffscreen?: boolean;
  /** Per-interface table, focus picker and sparkline. Off on Home. */
  showInterfaceList?: boolean;
  onOnline?: (online: boolean) => void;
}) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!pauseWhenOffscreen);
  const [focusIface, setFocusIface] = useState<string>("");
  const fetchTel = useServerFn(routerTelemetry);
  const prevRef = useRef<Telemetry | null>(null);
  const [rates, setRates] = useState<Record<string, { rx: number; tx: number }>>({});
  const [history, setHistory] = useState<Array<{ ts: number; rx: number; tx: number }>>([]);

  useEffect(() => {
    if (!pauseWhenOffscreen) {
      setVisible(true);
      return;
    }
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "120px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [pauseWhenOffscreen]);

  const enabled = active && visible && Boolean(routerId);

  const q = useQuery({
    // The board snapshot is independent of the selected interface. Keeping
    // focusIface out of the key prevents an unnecessary RouterOS request when
    // the operator only changes which already-loaded interface is displayed.
    queryKey: ["router-telemetry", routerId],
    queryFn: async () => {
      const data = (await fetchTel({
        data: { id: routerId, includeServices: false },
      })) as Telemetry;
      const prev = prevRef.current;
      if (prev && data.ts > prev.ts) {
        const dt = (data.ts - prev.ts) / 1000;
        const map: Record<string, { rx: number; tx: number }> = {};
        for (const cur of data.interfaces) {
          const p = prev.interfaces.find((x) => x.name === cur.name);
          if (p && dt > 0) {
            map[cur.name] = {
              rx: Math.max(0, (cur.rxBytes - p.rxBytes) / dt),
              tx: Math.max(0, (cur.txBytes - p.txBytes) / dt),
            };
          }
        }
        setRates(map);
        const iface = focusIface || data.interfaces.find((i) => i.running)?.name || "";
        const sample = iface && map[iface] ? map[iface] : { rx: 0, tx: 0 };
        if (showInterfaceList && iface) {
          setHistory((h) => [...h.slice(-23), { ts: data.ts, rx: sample.rx, tx: sample.tx }]);
        }
      }
      prevRef.current = data;
      if (showInterfaceList && !focusIface && data.interfaces.length) {
        const prefer =
          data.interfaces.find((i) => i.running && /ether|wlan|pppoe/i.test(i.name))?.name ??
          data.interfaces.find((i) => i.running)?.name ??
          data.interfaces[0]?.name ??
          "";
        if (prefer) setFocusIface(prefer);
      }
      return data;
    },
    enabled,
    // Home strip (no interface list) polls gentler; the detailed panel polls
    // every 10s while visible to reduce RouterOS/cloud load without making
    // the operator-facing rates feel stale.
    refetchInterval: enabled ? (showInterfaceList ? 10_000 : 15_000) : false,
    refetchOnWindowFocus: false,
  });

  const fetchServices = useServerFn(routerServiceCounts);
  const services = useQuery({
    queryKey: ["router-service-counts", routerId],
    queryFn: () => fetchServices({ data: { id: routerId } }),
    enabled: enabled && showInterfaceList,
    staleTime: 45_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (q.data) onOnline?.(q.data.online);
  }, [onOnline, q.data]);

  useEffect(() => {
    prevRef.current = null;
    setRates({});
    setHistory([]);
    setFocusIface("");
  }, [routerId]);

  useEffect(() => {
    if (!active) {
      prevRef.current = null;
      setRates({});
      setHistory([]);
    }
  }, [active]);

  const totals = useMemo(() => {
    let rx = 0,
      tx = 0;
    for (const v of Object.values(rates)) {
      rx += v.rx;
      tx += v.tx;
    }
    return { rx, tx };
  }, [rates]);

  const focusRate = focusIface ? rates[focusIface] : undefined;
  const maxHist = Math.max(1, ...history.flatMap((h) => [h.rx, h.tx]));

  return (
    <div ref={hostRef}>
      {q.isLoading && !q.data && <p className="text-muted-foreground">{t.copy("Connecting…")}</p>}
      {q.error && <p className="text-danger">{(q.error as Error).message}</p>}
      {q.data && (
        <>
          {Object.values(q.data.errors).some(Boolean) && (
            <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
              Live readings are limited:{" "}
              {Object.entries(q.data.errors)
                .filter(([, message]) => Boolean(message))
                .map(([name, message]) => `${name} — ${message}`)
                .join(" · ")}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Board"
              value={q.data.board_name ?? q.data.resource?.["board-name"] ?? "—"}
            />
            <Stat label="RouterOS" value={q.data.resource?.version ?? "—"} />
            <Stat label="Uptime" value={q.data.resource?.uptime ?? "—"} />
            <Stat
              label="CPU load"
              value={q.data.resource?.["cpu-load"] ? `${q.data.resource["cpu-load"]}%` : "—"}
            />
            <Stat
              label="Temperature"
              value={q.data.temperature_c != null ? `${q.data.temperature_c}°C` : "—"}
            />
            <Stat
              label="Active users"
              value={q.data.activeCount != null ? String(q.data.activeCount) : "—"}
            />
            <Stat
              label="Free memory"
              value={
                q.data.resource?.["free-memory"]
                  ? fmtBytes(Number(q.data.resource["free-memory"]))
                  : "—"
              }
            />
            <Stat
              label="Total memory"
              value={
                q.data.resource?.["total-memory"]
                  ? fmtBytes(Number(q.data.resource["total-memory"]))
                  : "—"
              }
            />
            <Stat label="Aggregate RX" value={fmtRate(totals.rx)} />
            <Stat label="Aggregate TX" value={fmtRate(totals.tx)} />
            {showInterfaceList ? (
              <>
                <Stat label="Focus RX" value={focusRate ? fmtRate(focusRate.rx) : "—"} />
                <Stat label="Focus TX" value={focusRate ? fmtRate(focusRate.tx) : "—"} />
              </>
            ) : null}
          </div>

          {showInterfaceList ? (
            <>
              {services.data && Object.values(services.data.errors).some(Boolean) && (
                <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                  Some service counts are unavailable:{" "}
                  {Object.entries(services.data.errors)
                    .filter(([, message]) => Boolean(message))
                    .map(([name, message]) => name + " — " + message)
                    .join(" · ")}
                </p>
              )}
              <ServiceCountsStrip
                counts={{
                  firewall_rules: services.data?.services.firewall_rules ?? null,
                  wireguard: services.data?.services.wireguard ?? null,
                  queue_trees: services.data?.services.queue_trees ?? null,
                  syslog_today: services.data?.services.syslog_today ?? null,
                }}
              />
            </>
          ) : null}

          {showInterfaceList ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t.label("Focus interface")}
                </label>
                <select
                  className="min-h-9 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]"
                  value={focusIface}
                  onChange={(e) => {
                    setFocusIface(e.target.value);
                    setHistory([]);
                  }}
                >
                  {q.data.interfaces.map((i) => (
                    <option key={i.name} value={i.name}>
                      {i.name}
                      {i.running ? "" : " (down)"}
                    </option>
                  ))}
                </select>
              </div>

              {history.length > 1 && (
                <div className="mt-2 flex h-12 items-end gap-0.5 rounded border border-border/60 bg-background/40 p-1">
                  {history.map((h) => (
                    <div key={h.ts} className="flex h-full flex-1 items-end gap-px">
                      <div
                        className="w-1/2 rounded-sm bg-emerald-500/70"
                        style={{ height: `${Math.max(4, (h.tx / maxHist) * 100)}%` }}
                        title={`TX ${fmtRate(h.tx)}`}
                      />
                      <div
                        className="w-1/2 rounded-sm bg-sky-500/70"
                        style={{ height: `${Math.max(4, (h.rx / maxHist) * 100)}%` }}
                        title={`RX ${fmtRate(h.rx)}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3">
                <div className="mb-1 font-medium">{t.label("Interfaces / traffic")}</div>
                {q.data.errors.interfaces ? (
                  <p className="text-amber-200">
                    Interfaces unavailable: {q.data.errors.interfaces}
                  </p>
                ) : q.data.interfaces.length === 0 ? (
                  <p className="text-muted-foreground">{t.copy("No interfaces reported.")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="py-1 pr-2 font-normal">Interface</th>
                          <th className="py-1 pr-2 font-normal">Type</th>
                          <th className="py-1 pr-2 font-normal">State</th>
                          <th className="py-1 pr-2 font-normal text-right">RX</th>
                          <th className="py-1 pr-2 font-normal text-right">TX</th>
                          <th className="py-1 pr-2 font-normal text-right">Total RX</th>
                          <th className="py-1 pr-2 font-normal text-right">Total TX</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.data.interfaces.map((i) => {
                          const r = rates[i.name];
                          const state = i.disabled ? "disabled" : i.running ? "up" : "down";
                          const stateColor = i.disabled
                            ? "text-muted-foreground"
                            : i.running
                              ? "text-success"
                              : "text-danger";
                          return (
                            <tr
                              key={i.name}
                              className={`border-t border-border/50 ${focusIface === i.name ? "bg-primary/5" : ""}`}
                            >
                              <td className="py-1 pr-2 font-mono">
                                <button
                                  type="button"
                                  className="hover:text-primary"
                                  onClick={() => {
                                    setFocusIface(i.name);
                                    setHistory([]);
                                  }}
                                >
                                  {i.name}
                                </button>
                              </td>
                              <td className="py-1 pr-2 text-muted-foreground">{i.type}</td>
                              <td className={`py-1 pr-2 ${stateColor}`}>{state}</td>
                              <td className="py-1 pr-2 text-right font-mono">
                                {r ? fmtRate(r.rx) : "—"}
                              </td>
                              <td className="py-1 pr-2 text-right font-mono">
                                {r ? fmtRate(r.tx) : "—"}
                              </td>
                              <td className="py-1 pr-2 text-right font-mono text-muted-foreground">
                                {fmtBytes(i.rxBytes)}
                              </td>
                              <td className="py-1 pr-2 text-right font-mono text-muted-foreground">
                                {fmtBytes(i.txBytes)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}

          <p className="mt-2 text-[10px] text-muted-foreground">
            {t.copy(
              "Polling every {interval}s from the live board · rates between polls · last update {time}",
              {
                interval: showInterfaceList ? 10 : 15,
                time: q.data ? new Date(q.data.ts).toLocaleTimeString() : "—",
              },
            )}
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs">{value}</div>
    </div>
  );
}
