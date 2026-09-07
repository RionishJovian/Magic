/**
 * Quick Config — operator-friendly toggle panel shown under each router card.
 * Lets operators enable/disable common hotspot business settings with a single
 * click. No RouterOS script syntax is ever shown.
 */
import { useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Ban,
  Clock3,
  EarthLock,
  LockKeyhole,
  RefreshCw,
  Scale,
  Settings2,
  ShieldCheck,
  type LucideProps,
} from "lucide-react";
import {
  configureFairShareQos,
  getQuickConfig,
  setQuickConfigFeature,
} from "@/lib/quick-config.functions";
import { getShieldStatus, setShield } from "@/lib/shield.functions";
import type { QuickConfigFeature } from "@/lib/quick-config.server";
import { useT } from "@/lib/i18n";
import { toErrorMessage } from "@/lib/error-message";

type FeatureIcon = ComponentType<LucideProps>;

type FeatureDef = {
  key: QuickConfigFeature;
  label: string;
  description: string;
  requirement: string;
  Icon: FeatureIcon;
  group: "protection";
};

/** Recommended first-live enable sequence (top → bottom within each group). */
const PROTECTION_FEATURE_ORDER = [
  "ntpSync",
  "clientIsolation",
  "wanInputGuard",
  "loginFloodGuard",
] as const satisfies readonly QuickConfigFeature[];

function featureDefs(t: ReturnType<typeof useT>): FeatureDef[] {
  return [
    {
      key: "ntpSync",
      label: t.label("NTP Time Sync"),
      description: t.copy(
        "Keeps the router clock accurate using Cloudflare + Google time servers, and sets Asia/Yangon (UTC+06:30) so schedules match the platform. Required for TLS certificates and daily backup times — voucher session lengths are relative and do not need NTP.",
      ),
      requirement: "Works on a reachable router",
      Icon: Clock3,
      group: "protection",
    },
    {
      key: "clientIsolation",
      label: t.label("Client Isolation"),
      description: t.copy(
        "Prevents hotspot guests from seeing or reaching each other's devices. Requires a LAN interface list on the board.",
      ),
      requirement: "Requires a LAN interface list",
      Icon: LockKeyhole,
      group: "protection",
    },
    {
      key: "wanInputGuard",
      label: t.label("WAN Input Guard"),
      description: t.copy(
        "Blocks unsolicited internet traffic to the router itself. WinBox and SSH stay LAN-only. Requires a WAN interface list.",
      ),
      requirement: "Requires a WAN interface list",
      Icon: EarthLock,
      group: "protection",
    },
    {
      key: "loginFloodGuard",
      label: t.label("Login Flood Guard"),
      description: t.copy(
        "If one device tries too many voucher codes too fast, the router kicks that MAC and blocks it for 30 minutes. Stops code-guessing tools without locking out normal guests.",
      ),
      requirement: "Requires Hotspot login or LAN rules",
      Icon: Ban,
      group: "protection",
    },
  ];
}

function orderedFeatureDefs(
  defs: FeatureDef[],
  order: readonly QuickConfigFeature[],
): FeatureDef[] {
  const byKey = new Map(defs.map((def) => [def.key, def]));
  return order.map((key) => byKey.get(key)).filter(Boolean) as FeatureDef[];
}

function FeatureGlyph({ Icon }: { Icon: FeatureIcon }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/20 text-foreground/70"
      aria-hidden
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} />
    </span>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function FeatureRow({
  def,
  enabled,
  error,
  warning,
  loading,
  disabled,
  onToggle,
  t,
}: {
  def: FeatureDef;
  enabled: boolean;
  error: string | null;
  warning?: string | null;
  loading: boolean;
  disabled: boolean;
  onToggle: (feature: QuickConfigFeature, value: boolean) => void;
  t: ReturnType<typeof useT>;
}) {
  const [showDesc, setShowDesc] = useState(false);
  const switchId = `qc-${def.key}`;

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 transition-colors ${
        error
          ? "border-danger/30 bg-danger/5"
          : enabled
            ? "border-primary/20 bg-primary/5"
            : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <FeatureGlyph Icon={def.Icon} />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={switchId}
            className={`block text-xs font-medium select-none ${disabled ? "text-muted-foreground" : "cursor-pointer text-foreground"}`}
          >
            {t.label(def.label)}
          </label>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{t.copy(def.requirement)}</p>
          {error && (
            <p className="mt-0.5 text-[10px] leading-snug text-danger break-words" title={error}>
              {error.length > 100 ? `${error.slice(0, 100)}…` : error}
            </p>
          )}
          {!error && warning && (
            <p className="mt-0.5 text-[10px] leading-snug text-warning break-words" title={warning}>
              {warning.length > 100 ? `${warning.slice(0, 100)}…` : warning}
            </p>
          )}
          {!error && !enabled && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">Off — not configured</p>
          )}
          {!error && enabled && !warning && (
            <p className="mt-0.5 text-[10px] text-primary">On — router check passed</p>
          )}
          {!error && enabled && warning && (
            <p className="mt-0.5 text-[10px] text-warning">On — verification incomplete</p>
          )}
          {error && <p className="mt-0.5 text-[10px] text-danger">Not configured / failed</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowDesc((v) => !v)}
          className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
          aria-label={showDesc ? t.copy("Hide description") : t.copy("Show description")}
        >
          {showDesc ? "▲" : "?"}
        </button>
        {loading ? (
          <span className="h-5 w-9 animate-pulse rounded-full bg-muted-foreground/30" />
        ) : (
          <ToggleSwitch
            id={switchId}
            checked={enabled}
            disabled={disabled}
            onChange={(v) => onToggle(def.key, v)}
          />
        )}
      </div>
      {showDesc && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t.copy(def.description)}
        </p>
      )}
    </div>
  );
}

/**
 * Login Bypass Shield — kept separate from the quick-config feature set because
 * it is backed by its own server functions (shield.functions.ts).
 */
function LoginBypassShieldRow({
  routerId,
  disabled,
  t,
}: {
  routerId: string;
  disabled: boolean;
  t: ReturnType<typeof useT>;
}) {
  const [showDesc, setShowDesc] = useState(false);
  const fetchStatus = useServerFn(getShieldStatus);
  const applyShield = useServerFn(setShield);
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["login-bypass-shield", routerId],
    queryFn: () => fetchStatus({ data: { routerId } }),
    staleTime: 30_000,
  });
  const mut = useMutation({
    mutationFn: (enabled: boolean) => applyShield({ data: { routerId, enabled } }),
    onSuccess: (result) => {
      if (result.warning) toast.warning(result.warning);
      else
        toast.success(
          result.enabled
            ? t.copy("Login Bypass Shield is on")
            : t.copy("Login Bypass Shield is off"),
        );
      void qc.invalidateQueries({ queryKey: ["login-bypass-shield", routerId] });
    },
    onError: (e: Error) =>
      toast.error(toErrorMessage(e, t.copy("Could not update Login Bypass Shield"))),
  });

  const enabled = status.data?.enabled ?? false;
  const warning = status.data?.warning ?? null;
  const error = status.data && !status.data.reachable ? status.data.error : null;
  const switchId = "qc-login-bypass-shield";

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 transition-colors ${
        error
          ? "border-danger/30 bg-danger/5"
          : enabled
            ? "border-primary/20 bg-primary/5"
            : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <FeatureGlyph Icon={ShieldCheck} />
        <div className="min-w-0 flex-1">
          <label
            htmlFor={switchId}
            className="block text-xs font-medium text-foreground select-none"
          >
            {t.label("Login Bypass Shield")}
          </label>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Requires a reachable Hotspot and LAN list
          </p>
          {error && (
            <p className="mt-0.5 text-[10px] leading-snug break-words text-danger" title={error}>
              {error.length > 100 ? `${error.slice(0, 100)}…` : error}
            </p>
          )}
          {!error && warning && (
            <p className="mt-0.5 text-[10px] leading-snug break-words text-warning">{warning}</p>
          )}
          {!error && !warning && (
            <p
              className={`mt-0.5 text-[10px] ${enabled ? "text-primary" : "text-muted-foreground"}`}
            >
              {enabled ? "On — router check passed" : "Off — not configured"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowDesc((v) => !v)}
          className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
          aria-label={showDesc ? t.copy("Hide description") : t.copy("Show description")}
        >
          {showDesc ? "▲" : "?"}
        </button>
        {status.isLoading || mut.isPending ? (
          <span className="h-5 w-9 animate-pulse rounded-full bg-muted-foreground/30" />
        ) : (
          <ToggleSwitch
            id={switchId}
            checked={enabled}
            disabled={disabled || Boolean(error)}
            onChange={(v) => mut.mutate(v)}
          />
        )}
      </div>
      {showDesc && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {t.copy(
            "Blocks VPN tunnels and outside DNS resolvers that guests use to skip the voucher login page. Needs a LAN interface list for full DNS protection.",
          )}
        </p>
      )}
    </div>
  );
}

function FairShareQosSetup({ routerId, disabled }: { routerId: string; disabled: boolean }) {
  const qc = useQueryClient();
  const apply = useServerFn(configureFairShareQos);
  const [guestCidr, setGuestCidr] = useState("");
  const [downloadMbps, setDownloadMbps] = useState("");
  const [uploadMbps, setUploadMbps] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      apply({
        data: {
          routerId,
          guestCidr,
          downloadMbps: Number(downloadMbps),
          uploadMbps: Number(uploadMbps),
        },
      }),
    onSuccess: () => {
      toast.success("Fair Share QoS is configured and verified");
      void qc.invalidateQueries({ queryKey: ["quick-config", routerId] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e, "Could not configure Fair Share QoS")),
  });
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-xs font-medium">
        <FeatureGlyph Icon={Scale} /> Fair Share QoS{" "}
        <span className="text-muted-foreground">Advanced setup</span>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Choose the guest network and enter measured WAN capacity. This never guesses from a
        management DHCP network.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <input
          value={guestCidr}
          onChange={(e) => setGuestCidr(e.target.value)}
          placeholder="Guest CIDR (e.g. 10.5.50.0/24)"
          className="h-9 rounded-md border bg-background px-2 text-xs"
          disabled={disabled || mut.isPending}
        />
        <input
          value={downloadMbps}
          onChange={(e) => setDownloadMbps(e.target.value)}
          inputMode="decimal"
          placeholder="Download Mbps"
          className="h-9 rounded-md border bg-background px-2 text-xs"
          disabled={disabled || mut.isPending}
        />
        <input
          value={uploadMbps}
          onChange={(e) => setUploadMbps(e.target.value)}
          inputMode="decimal"
          placeholder="Upload Mbps"
          className="h-9 rounded-md border bg-background px-2 text-xs"
          disabled={disabled || mut.isPending}
        />
      </div>
      <button
        type="button"
        className="mt-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"
        disabled={
          disabled ||
          mut.isPending ||
          !guestCidr ||
          Number(downloadMbps) <= 0 ||
          Number(uploadMbps) <= 0
        }
        onClick={() => mut.mutate()}
      >
        {mut.isPending ? "Applying…" : "Configure Fair Share QoS"}
      </button>
    </div>
  );
}

export function QuickConfigPanel({ routerId }: { routerId: string }) {
  const t = useT();
  const features = featureDefs(t);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const fetchConfig = useServerFn(getQuickConfig);
  const applyFeature = useServerFn(setQuickConfigFeature);

  const [pending, setPending] = useState<QuickConfigFeature | null>(null);

  const state = useQuery({
    queryKey: ["quick-config", routerId],
    queryFn: () => fetchConfig({ data: { routerId } }),
    enabled: open,
    staleTime: 30_000,
  });

  const unreachable = state.data != null && !state.data.reachable;
  const togglesDisabled = unreachable || state.isLoading || state.isFetching;

  const toggle = useMutation({
    mutationFn: ({ feature, enabled }: { feature: QuickConfigFeature; enabled: boolean }) => {
      setPending(feature);
      return applyFeature({ data: { routerId, feature, enabled } });
    },
    onSuccess: (result, { feature }) => {
      setPending(null);
      const def = features.find((f) => f.key === feature);
      const label = def?.label ?? feature;
      if (result.warning) {
        toast.warning(result.warning);
      } else if (result.enabled) {
        toast.success(t.copy("{label} is on", { label }));
      } else {
        toast.success(t.copy("{label} is off", { label }));
      }
      void qc.invalidateQueries({ queryKey: ["quick-config", routerId] });
    },
    onError: (e: Error, { feature }) => {
      setPending(null);
      const def = features.find((f) => f.key === feature);
      const label = def?.label ?? feature;
      toast.error(toErrorMessage(e, t.copy("Could not update {label}", { label })));
      void qc.invalidateQueries({ queryKey: ["quick-config", routerId] });
    },
  });

  const protectionFeatures = orderedFeatureDefs(features, PROTECTION_FEATURE_ORDER);
  const loadingRowCount = protectionFeatures.length + 1;

  const runProtectionCheck = async () => {
    await state.refetch();
    await qc.invalidateQueries({ queryKey: ["login-bypass-shield", routerId] });
    toast.success("Protection check refreshed");
  };

  const groups = [
    {
      id: "protection" as const,
      label: t.label("Protection"),
      features: protectionFeatures,
    },
  ];

  return (
    <section className="mt-3 rounded-xl border border-[color:var(--glass-border)] bg-white/5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Settings2 className="h-4 w-4 text-foreground/70" strokeWidth={1.5} aria-hidden />
          {t.label("Quick Config")}
          <span className="chip text-[10px]">{t.label("Hotspot settings")}</span>
        </div>
        <span className="flex items-center gap-2">
          {open && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-1 text-[10px] text-muted-foreground transition hover:border-primary/50 hover:text-primary disabled:opacity-50"
              onClick={() => void runProtectionCheck()}
              disabled={state.isFetching}
            >
              <RefreshCw className={`h-3 w-3 ${state.isFetching ? "animate-spin" : ""}`} aria-hidden />
              Check now
            </button>
          )}
          <svg
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-[color:var(--glass-border)] px-3 pb-3 pt-3">
          {state.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: loadingRowCount }, (_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/30" />
              ))}
            </div>
          )}

          {unreachable && (
            <p className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
              {t.copy(
                "Router unreachable — run Test on this card first. Quick Config needs a live REST connection to apply settings on the board.",
              )}
              {state.data?.reachError && (
                <span className="mt-1 block break-all text-muted-foreground">
                  {state.data.reachError}
                </span>
              )}
            </p>
          )}

          {state.data?.reachable && (
            <p className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-primary">Protection check complete.</span> These
              results describe the router configuration. Test with a guest phone before selling
              vouchers.
            </p>
          )}

          {state.error && !state.data && (
            <p className="text-[11px] text-danger">
              {t.copy("Could not load config: {message}", {
                message: state.error instanceof Error ? state.error.message : String(state.error),
              })}
            </p>
          )}

          {state.data?.features &&
            groups.map((group) => (
              <div key={group.id} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                  {group.features.flatMap((def) => {
                    const fs = state.data!.features[def.key];
                    const rows = [
                      <FeatureRow
                        key={def.key}
                        def={def}
                        enabled={fs?.enabled ?? false}
                        error={fs?.error ?? null}
                        warning={fs?.warning ?? null}
                        loading={pending === def.key && toggle.isPending}
                        disabled={togglesDisabled || toggle.isPending}
                        onToggle={(feature, enabled) => toggle.mutate({ feature, enabled })}
                        t={t}
                      />,
                    ];
                    if (def.key === "clientIsolation") {
                      rows.push(
                        <LoginBypassShieldRow
                          key="loginBypassShield"
                          routerId={routerId}
                          disabled={togglesDisabled || toggle.isPending}
                          t={t}
                        />,
                      );
                    }
                    return rows;
                  })}
                </div>
              </div>
            ))}

          {state.data?.reachable && (
            <FairShareQosSetup routerId={routerId} disabled={togglesDisabled || toggle.isPending} />
          )}

          <p className="mt-2 text-[10px] text-muted-foreground">
            Auto Daily Backup is disabled pending encrypted backup support. Trial Guest Access is
            not available here because this deployment uses voucher-code login.
          </p>

          <p className="mt-2 text-[10px] text-muted-foreground">
            {t.copy(
              "Changes apply to the router immediately over REST. Settings persist across reboots. Does not modify Magic Hub WireGuard or www-ssl.",
            )}
          </p>
        </div>
      )}
    </section>
  );
}
