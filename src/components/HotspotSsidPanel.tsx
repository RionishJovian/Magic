/**
 * Hotspot Wi-Fi (SSID) — one-panel checklist + setup for pool, profile, server, and SSID.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Wifi } from "lucide-react";
import { toast } from "sonner";
import type {
  HotspotApplyResult,
  HotspotSetupMode,
  HotspotSetupPreview,
} from "@/lib/wifi-hotspot.server";
import { parseLanPortsFromHotspotAuditDetail } from "@/lib/wifi-hotspot.server";
import {
  applyHotspotSetupFn,
  getWifiHotspotProbe,
  listHotspotSetupAuditFn,
  previewHotspotSetupFn,
  removeMagicHotspotGuestFn,
} from "@/lib/wifi-hotspot.functions";
import { HotspotApplyTraceDialog } from "@/components/HotspotApplyTraceDialog";
import { HotspotSetupReviewDialog } from "@/components/HotspotSetupReviewDialog";
import { ButtonSpinner } from "@/components/ui/button";
import { toErrorMessage } from "@/lib/error-message";
import { ROUTER_OPS_AUDIT_QUERY_KEY } from "@/lib/audit.functions";
import { scanConnectedApSsids } from "@/lib/access-points.functions";

function CheckPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-200"
      }`}
    >
      <span aria-hidden>{ok ? "✓" : "○"}</span>
      {label}
    </span>
  );
}

export function HotspotSsidPanel({
  routerId,
  routerName,
  privileged,
}: {
  routerId: string;
  routerName: string;
  privileged: boolean;
}) {
  const qc = useQueryClient();
  // Collapsed by default: open probes ~14 RouterOS paths per card. Header +
  // “Tap to set up…” copy stay visible so phones are not a blank row.
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState<HotspotSetupMode>("builtin-wifi");
  const [modeTouched, setModeTouched] = useState(false);
  const [ssid, setSsid] = useState("");
  const [ssidTouched, setSsidTouched] = useState(false);
  const [band24, setBand24] = useState(true);
  const [band5, setBand5] = useState(true);
  const [bridge, setBridge] = useState("");
  const [lanPorts, setLanPorts] = useState<string[]>([]);
  const [lanPortsTouched, setLanPortsTouched] = useState(false);
  const [externalApConfirmed, setExternalApConfirmed] = useState(false);
  const [disableCap, setDisableCap] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [preview, setPreview] = useState<HotspotSetupPreview | null>(null);
  const [applyResult, setApplyResult] = useState<HotspotApplyResult | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  const fetchProbe = useServerFn(getWifiHotspotProbe);
  const fetchPreview = useServerFn(previewHotspotSetupFn);
  const applySetup = useServerFn(applyHotspotSetupFn);
  const removeGuest = useServerFn(removeMagicHotspotGuestFn);
  const fetchAudit = useServerFn(listHotspotSetupAuditFn);
  const scanApSsids = useServerFn(scanConnectedApSsids);

  const probe = useQuery({
    queryKey: ["wifi-hotspot-probe", routerId],
    queryFn: () => fetchProbe({ data: { routerId } }),
    enabled: panelOpen,
    staleTime: 20_000,
  });

  const recentAudit = useQuery({
    queryKey: ["hotspot-setup-audit", routerId],
    queryFn: () => fetchAudit({ data: { routerId, limit: 3 } }),
    enabled: panelOpen,
    staleTime: 30_000,
  });

  const apSsidScan = useQuery({
    queryKey: ["hotspot-connected-ap-ssids", routerId],
    queryFn: () => scanApSsids({ data: { routerId } }),
    enabled: panelOpen && mode === "lan-port",
    staleTime: 60_000,
    retry: false,
  });

  const data = probe.data;

  useEffect(() => {
    if (data && !modeTouched) setMode(data.defaultMode);
  }, [data, modeTouched]);

  useEffect(() => {
    if (data?.capModeActive) setDisableCap(true);
  }, [data?.capModeActive]);

  useEffect(() => {
    if (ssidTouched || ssid.trim() || apSsidScan.data?.ssids.length !== 1) return;
    setSsid(apSsidScan.data.ssids[0].name);
  }, [apSsidScan.data, ssid, ssidTouched]);

  useEffect(() => {
    if (!data || mode !== "lan-port" || lanPortsTouched) return;
    const prior = recentAudit.data?.find(
      (row) => row.action === "hotspot_setup_result" && row.outcome === "ok",
    );
    const allowed = new Set(data.etherPorts.map((port) => port.name));
    const suggested = parseLanPortsFromHotspotAuditDetail(prior?.detail).filter((port) =>
      allowed.has(port),
    );
    if (suggested.length) setLanPorts(suggested);
  }, [data, mode, lanPortsTouched, recentAudit.data]);

  const bands = useMemo(() => {
    const out: Array<"2.4" | "5"> = [];
    if (band24) out.push("2.4");
    if (band5) out.push("5");
    return out;
  }, [band24, band5]);

  const effectiveBridge = bridge || data?.suggestedBridge || "";

  const buildInput = () => ({
    routerId,
    mode,
    ssid: ssid.trim(),
    bridge: effectiveBridge,
    bands: mode === "builtin-wifi" ? bands : [],
    lanPorts: mode === "lan-port" ? lanPorts : [],
    externalApConfirmed: mode === "lan-port" ? externalApConfirmed : false,
    disableCapMode: disableCap,
  });

  const previewMut = useMutation({
    mutationFn: () => fetchPreview({ data: buildInput() }),
    onSuccess: (p) => {
      setPreview(p);
      setReviewOpen(true);
    },
    onError: (e: Error) => toast.error(toErrorMessage(e, "Could not build preview")),
  });

  const applyMut = useMutation({
    mutationFn: () => applySetup({ data: buildInput() }),
    onSuccess: async (r) => {
      setApplyResult(r);
      setReviewOpen(false);
      setTraceOpen(true);
      await qc.refetchQueries({ queryKey: ["wifi-hotspot-probe", routerId] });
      void qc.invalidateQueries({ queryKey: ["hotspot-setup-audit", routerId] });
      void qc.invalidateQueries({ queryKey: ROUTER_OPS_AUDIT_QUERY_KEY });
      if (!r.ok) {
        toast.error(r.error ?? "Hotspot apply failed partway through");
        return;
      }
      const created = r.created.length;
      const skipped = r.skipped.length;
      toast.success(
        created > 0
          ? `Hotspot applied on ${routerName} (${created} created${skipped ? `, ${skipped} skipped` : ""})`
          : `Hotspot already configured on ${routerName} (${skipped} steps skipped)`,
      );
      if (r.warnings.length) toast.message(r.warnings.join(" "));
    },
    onError: (e: Error) => toast.error(toErrorMessage(e, "Could not apply hotspot setup")),
  });

  const removeMut = useMutation({
    mutationFn: () => removeGuest({ data: { routerId } }),
    onSuccess: (r) => {
      if (r.removed.length) {
        toast.success(`Removed ${r.removed.length} Magic guest Wi‑Fi object(s)`);
      } else {
        toast.message("No Magic guest Wi‑Fi objects to remove");
      }
      if (r.errors.length) toast.error(r.errors.join(" · "));
      void qc.invalidateQueries({ queryKey: ["wifi-hotspot-probe", routerId] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e, "Could not remove guest Wi‑Fi")),
  });

  const canUseMode = mode === "builtin-wifi" ? data?.canSetupBuiltin : data?.canSetupLanPort;

  const formValid =
    Boolean(ssid.trim()) &&
    Boolean(effectiveBridge) &&
    (mode === "lan-port" ? lanPorts.length > 0 : bands.length > 0) &&
    (mode !== "lan-port" || externalApConfirmed) &&
    (!data?.capModeActive || disableCap || mode === "lan-port");

  const setupDisabledReason = !canUseMode
    ? data?.setupBlockedReason
    : !ssid.trim()
      ? "Enter a guest SSID name."
      : !effectiveBridge
        ? "Select a hotspot bridge."
        : mode === "builtin-wifi" && bands.length === 0
          ? "Pick at least one band (2.4 GHz and/or 5 GHz)."
          : mode === "lan-port" && lanPorts.length === 0
            ? "Select at least one LAN port."
            : mode === "lan-port" && !externalApConfirmed
              ? "Confirm the selected port connects to your external guest AP."
              : data?.capModeActive && !disableCap && mode === "builtin-wifi"
                ? "Check “Use local AP mode” — radios are waiting on CAPsMAN."
                : null;

  return (
    <>
      <section className="mt-3 rounded-xl border border-[color:var(--glass-border)] bg-white/5">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <Wifi className="h-4 w-4 text-foreground/70" strokeWidth={1.5} aria-hidden />
              Hotspot Wi-Fi (SSID)
              <span className="chip text-[10px]">Guest network</span>
            </div>
            {!panelOpen && (
              <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
                Set up built-in Wi‑Fi or connect an external guest AP
              </p>
            )}
          </div>
          <svg
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${panelOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {panelOpen && (
          <div className="space-y-3 border-t border-[color:var(--glass-border)] px-3 py-3">
            {probe.isLoading && (
              <p className="text-xs text-muted-foreground">Reading router Wi‑Fi and hotspot…</p>
            )}
            {probe.error && (
              <div className="space-y-2 rounded-md border border-danger/30 bg-danger/5 p-2 text-xs text-danger">
                <p>{toErrorMessage(probe.error)}</p>
                <button
                  type="button"
                  className="rounded-md border border-danger/40 px-2 py-1 text-[11px] font-medium text-danger"
                  onClick={() => void probe.refetch()}
                >
                  Retry
                </button>
              </div>
            )}
            {data && !data.reachable && (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">
                <p>
                  {data.reachError ??
                    "Router unreachable — Magic Hub Test must pass before hotspot setup."}
                </p>
                <p className="text-[11px] text-amber-100/80">
                  On this card: Check now → Test. When Online, open this panel again.
                </p>
                <button
                  type="button"
                  className="rounded-md border border-amber-500/40 px-2 py-1 text-[11px] font-medium"
                  onClick={() => void probe.refetch()}
                >
                  Retry read
                </button>
              </div>
            )}

            {data?.reachable && (
              <>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    <CheckPill
                      ok={data.checklist.pool && data.checklist.profile && data.checklist.server}
                      label="Captive portal"
                    />
                    <CheckPill ok={data.checklist.ssid} label="Guest Wi‑Fi" />
                    <CheckPill
                      ok={data.voucherLoginMode === "local"}
                      label={
                        data.voucherLoginMode === "radius"
                          ? "RADIUS enabled — vouchers blocked"
                          : data.voucherLoginMode === "local"
                            ? "Local voucher login"
                            : "Voucher login not configured"
                      }
                    />
                  </div>
                  {data.voucherLoginMode === "radius" && (
                    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-100">
                      <p className="font-medium">Local voucher login is blocked by this profile.</p>
                      <p className="mt-1 text-red-100/80">
                        Magic vouchers use RouterOS-local HotSpot users. Configure and monitor a
                        real RADIUS service intentionally, or set <code>use-radius=no</code> on the
                        managed HotSpot profile before selling codes.
                      </p>
                    </div>
                  )}
                  {(() => {
                    const magic = data.wifiInterfaces.filter((w) => w.managedByMagic);
                    const ssids = [
                      ...new Set(magic.map((w) => w.ssid?.trim()).filter(Boolean) as string[]),
                    ];
                    if (!magic.length && !data.capModeActive && !data.checklist.ssid) {
                      return (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
                          No guest SSID name on this board yet. Enter a name below and tap Set up
                          hotspot — phones will only see the Wi‑Fi after Apply succeeds.
                        </div>
                      );
                    }
                    return (
                      <div className="rounded-md border border-border/50 bg-black/20 px-2.5 py-2 text-[11px]">
                        <p className="font-medium text-foreground">
                          {ssids.length
                            ? `SSID on this board: ${ssids.join(" · ")}`
                            : data.capModeActive
                              ? "No guest SSID yet — CAP is active (check Use local AP mode, then Apply)."
                              : "Magic Wi‑Fi objects found, but no SSID string — re-run Set up hotspot."}
                        </p>
                        {magic.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                            {magic.map((w) => (
                              <li key={w.id}>
                                <span className="font-mono text-[10px] text-foreground/80">
                                  {w.name}
                                </span>
                                {w.ssid ? ` · “${w.ssid}”` : " · (no SSID on configuration)"}
                                {w.band !== "unknown" ? ` · ${w.band} GHz` : ""}
                                {w.disabled ? " · disabled" : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })()}
                  <p className="text-[11px] text-muted-foreground">
                    Choose <strong className="font-medium text-foreground">Built-in Wi‑Fi</strong>,
                    enter a guest SSID, then{" "}
                    <strong className="font-medium text-foreground">Set up hotspot</strong>. That
                    creates pool, DHCP, login profile, captive portal, and SSID on this board. After
                    Apply, confirm the SSID name above, then continue in Business:
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                    <Link to="/app/vouchers" className="text-primary hover:underline">
                      Vouchers →
                    </Link>
                    <Link to="/app/portal" className="text-primary hover:underline">
                      Portal →
                    </Link>
                    <Link to="/app/revenue" className="text-primary hover:underline">
                      Revenue →
                    </Link>
                  </div>
                  {recentAudit.data?.length ? (
                    <div className="rounded-md border border-border/50 bg-black/20 px-2 py-1.5 text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground">Recent apply:</span>{" "}
                      {recentAudit.data
                        .filter((row) => row.action === "hotspot_setup_result")
                        .slice(0, 1)
                        .map((row) => (
                          <span key={row.id}>
                            {row.detail ?? row.outcome}
                            {row.error_message ? ` — ${row.error_message}` : ""}
                          </span>
                        ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex rounded-lg border border-border/50 p-0.5 text-xs">
                  <button
                    type="button"
                    disabled={!data.canSetupBuiltin}
                    onClick={() => {
                      setModeTouched(true);
                      setMode("builtin-wifi");
                    }}
                    className={`flex-1 rounded-md px-2 py-1.5 transition ${
                      mode === "builtin-wifi"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground disabled:opacity-40"
                    }`}
                  >
                    Built-in Wi‑Fi
                  </button>
                  <button
                    type="button"
                    disabled={!data.canSetupLanPort}
                    onClick={() => {
                      setModeTouched(true);
                      setMode("lan-port");
                    }}
                    className={`flex-1 rounded-md px-2 py-1.5 transition ${
                      mode === "lan-port"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground disabled:opacity-40"
                    }`}
                  >
                    AP on LAN port
                  </button>
                </div>

                {!canUseMode && data.setupBlockedReason && (
                  <p className="text-xs text-amber-200">{data.setupBlockedReason}</p>
                )}

                {!data.canSetupBuiltin && data.canSetupLanPort && (
                  <p className="text-[11px] text-muted-foreground">
                    Built-in Wi‑Fi is not available on this board right now — use AP on LAN port, or
                    fix CAP / wifiwave2 on the router.
                  </p>
                )}

                <div className="space-y-3 rounded-md border border-border/50 p-3">
                  <label className="block text-xs">
                    <span className="mb-1 block text-muted-foreground">Guest SSID name</span>
                    <input
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                      placeholder="Guest-WiFi"
                      value={ssid}
                      maxLength={32}
                      onChange={(e) => {
                        setSsidTouched(true);
                        setSsid(e.target.value);
                      }}
                    />
                  </label>
                  {mode === "lan-port" && (
                    <div className="rounded-md border border-border/50 bg-muted/30 p-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">Connected AP SSIDs</span>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline disabled:opacity-50"
                          disabled={apSsidScan.isFetching}
                          onClick={() => void apSsidScan.refetch()}
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${apSsidScan.isFetching ? "animate-spin" : ""}`}
                            aria-hidden
                          />
                          {apSsidScan.isFetching ? "Scanning…" : "Scan again"}
                        </button>
                      </div>
                      {apSsidScan.isPending ? (
                        <p className="mt-1 text-muted-foreground">
                          Scanning linked AP controllers…
                        </p>
                      ) : apSsidScan.isError ? (
                        <p className="mt-1 text-amber-700 dark:text-amber-200">
                          Could not scan linked APs. You can still enter the SSID manually.
                        </p>
                      ) : apSsidScan.data?.ssids.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {apSsidScan.data.ssids.map((detected) => (
                            <button
                              key={`${detected.controllerId}:${detected.name}`}
                              type="button"
                              className={`rounded-full border px-2.5 py-1 font-medium transition ${
                                ssid === detected.name
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-foreground hover:border-primary/60"
                              }`}
                              onClick={() => {
                                setSsidTouched(true);
                                setSsid(detected.name);
                              }}
                              title={`${detected.controllerName} · ${detected.brand}`}
                            >
                              {detected.name}
                              {detected.hidden ? " (hidden)" : ""}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-muted-foreground">
                          {apSsidScan.data?.controllersChecked
                            ? "No enabled SSID was reported. Enter it manually or check the AP controller."
                            : "No AP controller is linked to this router or site. Add it under Access points, or enter the SSID manually."}
                        </p>
                      )}
                      {Boolean(apSsidScan.data?.failedControllers.length) && (
                        <p className="mt-1 text-amber-700 dark:text-amber-200">
                          Some linked APs could not be read; available results are shown.
                        </p>
                      )}
                    </div>
                  )}
                  {effectiveBridge && !data.bridgeFoundations?.[effectiveBridge]?.gatewayIp && (
                    <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">
                      This bridge has no gateway IP. Use the optional{" "}
                      <strong>Gateway Bootstrap</strong> panel above first, then return here to
                      create the SSID and HotSpot. WAN settings stay unchanged.
                    </p>
                  )}

                  {mode === "builtin-wifi" && (
                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={band24}
                          onChange={(e) => setBand24(e.target.checked)}
                        />
                        2.4 GHz
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={band5}
                          onChange={(e) => setBand5(e.target.checked)}
                        />
                        5 GHz
                      </label>
                    </div>
                  )}

                  {mode === "lan-port" && (
                    <div className="space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-muted-foreground">LAN ports (AP / switch)</span>
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-primary hover:underline"
                          onClick={() => {
                            setLanPortsTouched(true);
                            setLanPorts(data.etherPorts.map((p) => p.name));
                            setExternalApConfirmed(false);
                          }}
                        >
                          Select all
                        </button>
                      </div>
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        Select only the LAN ports connected to your guest AP or switch. WAN and
                        uplink ports are excluded and rejected by the router safety check.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {data.etherPorts.map((p) => (
                          <label key={p.name} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={lanPorts.includes(p.name)}
                              onChange={(e) => {
                                setLanPortsTouched(true);
                                setExternalApConfirmed(false);
                                setLanPorts((prev) =>
                                  e.target.checked
                                    ? [...prev, p.name]
                                    : prev.filter((name) => name !== p.name),
                                );
                              }}
                            />
                            <span className="font-mono text-[11px]">{p.label}</span>
                          </label>
                        ))}
                      </div>
                      {lanPorts.length > 0 && !lanPortsTouched && (
                        <p className="rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-[10px] text-sky-100">
                          Previously applied port{lanPorts.length > 1 ? "s" : ""} suggested:{" "}
                          <span className="font-mono">{lanPorts.join(" · ")}</span>. Confirm the
                          cable still leads to the guest AP before applying.
                        </p>
                      )}
                      <label className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
                          checked={externalApConfirmed}
                          onChange={(e) => setExternalApConfirmed(e.target.checked)}
                        />
                        <span>
                          I confirm the selected port connects to the guest AP or switch. The AP is
                          in bridge/AP mode, its DHCP server is off, and it broadcasts{" "}
                          <strong>{ssid.trim() || "the SSID entered above"}</strong>.
                        </span>
                      </label>
                    </div>
                  )}

                  <label className="block text-xs">
                    <span className="mb-1 block text-muted-foreground">Hotspot bridge</span>
                    <select
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                      value={effectiveBridge}
                      onChange={(e) => setBridge(e.target.value)}
                    >
                      {data.bridges.map((b) => {
                        const gw =
                          data.bridgeFoundations?.[b.name]?.gatewayIp ??
                          (b.name === data.suggestedBridge ? data.foundation.gatewayIp : null);
                        return (
                          <option key={b.name} value={b.name}>
                            {b.label}
                            {gw ? ` · ${gw}` : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  {mode === "builtin-wifi" && data.capModeActive && (
                    <div className="space-y-2 rounded-md border-2 border-amber-400 bg-amber-500/15 p-3 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]">
                      <p className="text-xs font-semibold leading-snug text-amber-50">
                        Local AP mode required
                      </p>
                      <p className="text-[11px] leading-relaxed text-amber-100/90">
                        WinBox shows wifi1/wifi2 waiting on CAPsMAN. Apply will not create a guest
                        SSID until local AP mode is on (checked by default below).
                      </p>
                      <label className="flex items-start gap-2 text-xs font-semibold text-amber-50">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
                          checked={disableCap}
                          onChange={(e) => setDisableCap(e.target.checked)}
                        />
                        Use local AP mode (disable CAP client)
                      </label>
                    </div>
                  )}
                  {mode === "builtin-wifi" && !data.capModeActive && (
                    <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        checked={disableCap}
                        onChange={(e) => setDisableCap(e.target.checked)}
                      />
                      If WinBox shows “no connection to CAPsMAN”, enable local AP mode before Apply
                    </label>
                  )}

                  <button
                    type="button"
                    disabled={!privileged || !formValid || !canUseMode || previewMut.isPending}
                    onClick={() => previewMut.mutate()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {previewMut.isPending && <ButtonSpinner />}
                    Set up hotspot
                  </button>
                  {!privileged && (
                    <p className="text-[11px] text-warning">
                      Router configuration permission is required to apply.
                    </p>
                  )}
                  {!formValid && setupDisabledReason && (
                    <p className="text-[11px] text-amber-200">{setupDisabledReason}</p>
                  )}

                  {data.wifiInterfaces.some((w) => w.managedByMagic) && (
                    <button
                      type="button"
                      disabled={!privileged || removeMut.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove Magic guest Wi‑Fi objects (SSID, VAPs, security) from this router? Hotspot pool/profile/server stay in place.",
                          )
                        ) {
                          removeMut.mutate();
                        }
                      }}
                      className="inline-flex w-full items-center justify-center rounded-md border border-danger/40 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
                    >
                      {removeMut.isPending ? "Removing…" : "Remove Magic guest Wi‑Fi"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <HotspotSetupReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        preview={preview}
        routerName={routerName}
        applying={applyMut.isPending}
        canApply={privileged}
        onApply={() => applyMut.mutate()}
      />

      <HotspotApplyTraceDialog
        open={traceOpen}
        onOpenChange={setTraceOpen}
        routerName={routerName}
        result={applyResult}
        suggestPortalPublish={Boolean(applyResult?.ok && applyResult.created.length > 0)}
      />
    </>
  );
}
