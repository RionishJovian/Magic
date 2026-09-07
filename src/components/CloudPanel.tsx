// Magic Hub panel on a router card. Filename is legacy ("CloudPanel");
// Magic Hub is Cloud Remote (MVP).
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  cloudRouterState,
  provisionCloudRouter,
  checkCloudRouter,
  disableCloudRouter,
} from "@/lib/cloud-router.functions";
import { MagicHubButton } from "@/components/MagicHubSparkle";
import { MagicHubPasteDialog } from "@/components/MagicHubPasteDialog";
import { TypedConfirmDialog } from "@/components/TypedConfirmDialog";
import { REMOVE_DEVICE_PHRASE } from "@/lib/device-removal";
import { useT } from "@/lib/i18n";
import { toErrorMessage } from "@/lib/error-message";
import { magicHubScriptStorageKey } from "./cloud-panel.helpers";

type Artifacts = Awaited<ReturnType<typeof provisionCloudRouter>>;

const STATUS_STYLE: Record<string, string> = {
  online: "bg-success shadow-[0_0_10px_var(--color-success)]",
  connecting: "bg-warning",
  offline: "bg-danger shadow-[0_0_10px_var(--color-danger)]",
  incomplete: "bg-warning",
  error: "bg-danger",
  pending: "bg-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  online: "Online",
  connecting: "Connecting…",
  offline: "Offline",
  incomplete: "Setup incomplete",
  error: "Error",
  pending: "Not connected",
};

function readStoredArtifacts(routerId: string): Artifacts | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(magicHubScriptStorageKey(routerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Artifacts;
    if (typeof parsed?.routerScript === "string" && parsed.routerScript.length > 0) return parsed;
  } catch {
    /* ignore quota / parse */
  }
  return null;
}

function persistArtifacts(routerId: string, artifacts: Artifacts | null) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const key = magicHubScriptStorageKey(routerId);
    if (artifacts?.routerScript) sessionStorage.setItem(key, JSON.stringify(artifacts));
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore quota */
  }
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "never";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

export function CloudPanel({
  routerId,
  routerName,
  initialArtifacts = null,
  onPasteScript,
}: {
  routerId: string;
  routerName: string;
  initialArtifacts?: Artifacts | null;
  /** Notify parent so Routers can open a page-level paste dialog (survives site filter remounts). */
  onPasteScript?: (artifacts: Artifacts) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [artifacts, setArtifacts] = useState<Artifacts | null>(initialArtifacts);
  const [scriptOpen, setScriptOpen] = useState(() =>
    onPasteScript ? false : Boolean(initialArtifacts?.routerScript),
  );
  const [removeOpen, setRemoveOpen] = useState(false);
  const onPasteRef = useRef(onPasteScript);
  onPasteRef.current = onPasteScript;

  useEffect(() => {
    if (initialArtifacts?.routerScript) {
      setArtifacts(initialArtifacts);
      persistArtifacts(routerId, initialArtifacts);
      if (onPasteRef.current) onPasteRef.current(initialArtifacts);
      else setScriptOpen(true);
      return;
    }
    const stored = readStoredArtifacts(routerId);
    if (stored) {
      // Restore script for "Show paste window" — do not auto-open on every nav/remount.
      setArtifacts(stored);
    }
  }, [initialArtifacts, routerId]);

  const stateFn = useServerFn(cloudRouterState);
  const provisionFn = useServerFn(provisionCloudRouter);
  const checkFn = useServerFn(checkCloudRouter);
  const disableFn = useServerFn(disableCloudRouter);

  const state = useQuery({
    queryKey: ["cloud-router", routerId],
    queryFn: () => stateFn({ data: { routerId } }),
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const provision = useMutation({
    mutationFn: () => provisionFn({ data: { routerId, reissueScript: true } }),
    onSuccess: (res) => {
      setArtifacts(res);
      persistArtifacts(routerId, res);
      if (res.routerScript) {
        if (onPasteRef.current) onPasteRef.current(res);
        else setScriptOpen(true);
        toast.success("Magic Hub ready — paste the script on your router");
      } else {
        toast.error(
          "Magic Hub peer exists but the paste script could not be issued. Tap Remove, then Connect via Hub again.",
        );
      }
      void qc.invalidateQueries({ queryKey: ["cloud-router", routerId] });
      void qc.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (e: Error) =>
      toast.error(toErrorMessage(e, "Magic Hub provision failed."), { duration: 12_000 }),
  });

  const check = useMutation({
    mutationFn: () => checkFn({ data: { routerId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cloud-router", routerId] }),
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const disable = useMutation({
    mutationFn: (confirmation: string) => disableFn({ data: { routerId, confirmation } }),
    onSuccess: () => {
      setArtifacts(null);
      persistArtifacts(routerId, null);
      setScriptOpen(false);
      setRemoveOpen(false);
      toast.success("Magic Hub connection removed");
      void qc.invalidateQueries({ queryKey: ["cloud-router", routerId] });
      void qc.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const s = state.data;
  const status = s?.status ?? "pending";
  const script = artifacts?.routerScript ?? null;

  return (
    <section className="mt-3 rounded-xl border border-[color:var(--glass-border)] bg-white/5 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={`inline-flex h-2 w-2 rounded-full ${STATUS_STYLE[status]}`} />
          Magic Hub
          <span className="chip">{STATUS_LABEL[status]}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {script && (
            <button
              type="button"
              className="min-h-11 rounded-full border border-primary/50 bg-primary/10 px-3 text-primary transition hover:border-primary sm:min-h-9"
              onClick={() => setScriptOpen(true)}
            >
              Show paste window
            </button>
          )}
          <button
            className="min-h-11 rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 transition hover:border-primary/50 hover:text-primary sm:min-h-9"
            onClick={() => check.mutate()}
            disabled={check.isPending || !s?.configured}
          >
            {check.isPending ? "Checking…" : "Check now"}
          </button>
          {state.isSuccess && s?.configured ? (
            <button
              className="min-h-11 rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 transition hover:border-danger/50 hover:text-danger sm:min-h-9"
              onClick={() => setRemoveOpen(true)}
              disabled={disable.isPending}
            >
              Remove
            </button>
          ) : state.isSuccess && !s?.configured ? (
            <MagicHubButton
              className="min-h-11 rounded-full bg-primary px-3 font-medium text-primary-foreground disabled:opacity-60 sm:min-h-9"
              onClick={() => provision.mutate()}
              disabled={provision.isPending}
            >
              {provision.isPending ? "Provisioning…" : "Connect via Hub"}
            </MagicHubButton>
          ) : null}
        </div>
      </header>

      <p className="mt-2 text-[11px] text-muted-foreground">
        {t.copy("Magic Hub is Cloud Remote — the main way the app reaches this board.")}
      </p>
      {status === "incomplete" && s?.error && (
        <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
          <p className="font-medium">Magic Hub setup is incomplete</p>
          <p className="mt-1">{s.error}</p>
          <p className="mt-1 text-muted-foreground">
            Enable read access for the account&apos;s full group, then select Check now again.
          </p>
        </div>
      )}

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
        <div>
          <dt>Tunnel IP</dt>
          <dd className="font-mono break-all text-foreground">{s?.address ?? "—"}</dd>
        </div>
        <div>
          <dt>This router’s public key</dt>
          <dd className="font-mono truncate text-foreground">{s?.publicKey ?? "—"}</dd>
        </div>
        <div>
          <dt>Last handshake</dt>
          <dd className="text-foreground">{timeAgo(s?.lastHandshakeAt)}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd className="text-foreground">{timeAgo(s?.lastSeenAt)}</dd>
        </div>
      </dl>

      {s?.error && <p className="mt-2 text-[11px] break-all text-danger">{s.error}</p>}

      {!s?.configured && !script && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t.copy(
            "Tap Connect via Hub (or Add router with Magic Hub selected). A window then shows the paste script. That window is Cloud Remote, not the Scripts page.",
          )}
        </p>
      )}

      {artifacts && !script && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t.copy(
            "This board is already on Magic Hub (Cloud Remote). The paste script appears once in a window after Add router or Connect via Hub — not on the Scripts page. If you lost it, Remove then Connect via Hub.",
          )}
        </p>
      )}

      <MagicHubPasteDialog
        open={scriptOpen}
        onOpenChange={setScriptOpen}
        script={script}
        rollbackScript={artifacts?.rollbackScript ?? ""}
      />

      <TypedConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t.copy("Remove Magic Hub for {name}?", { name: routerName })}
        description={t.copy(
          "This device is already connected. Continue, then type the confirmation phrase. The live Magic Hub tunnel and its keys will be removed.",
        )}
        typeHint={t.copy("Type the English phrase below exactly to finish removing this device.")}
        phrase={REMOVE_DEVICE_PHRASE}
        confirmLabel="Remove"
        pending={disable.isPending}
        onConfirm={(typed) => disable.mutate(typed)}
      />
    </section>
  );
}
