import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getMe } from "@/lib/auth.functions";
import { useT } from "@/lib/i18n";
import { ConnectorWizard } from "@/components/ConnectorWizard";
import { RemoteAccessChooser } from "@/components/RemoteAccessChooser";
import {
  listConnectors,
  listConnectorDevices,
  listDiscoveredRouters,
  saveConnector,
  setConnectorEnabled,
  generatePairingCode,
  unpairConnector,
  deleteConnector,
  testConnector,
} from "@/lib/connectors.functions";
import { connectorInstallOrigin } from "@/lib/connector-install-origin";
import { DelayedFallback, SkeletonList } from "@/components/ui/skeleton";
import { ButtonSpinner } from "@/components/ui/button";
import { copyText } from "@/lib/browser/clipboard";
import { detectDesktopOs } from "@/lib/browser/platform";
import { toErrorMessage } from "@/lib/error-message";

export const Route = createFileRoute("/_authenticated/app/connectors")({
  head: () => ({
    meta: [
      { title: "Connectors — MikroTik Hotspot Admin" },
      {
        name: "description",
        content:
          "Pair a local MikroTik Magic Connector so routers and access points on a private LAN can be managed without port forwarding.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConnectorsPage,
});

function StatusPill({ online, enabled }: { online: boolean; enabled: boolean }) {
  const label = !enabled ? "Disabled" : online ? "Online" : "Offline";
  const tone = !enabled
    ? "border-border text-muted-foreground"
    : online
      ? "border-emerald-500/40 text-emerald-300"
      : "border-amber-500/40 text-amber-300";
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${tone}`}>{label}</span>;
}

function ConnectorDevices({ id }: { id: string }) {
  const t = useT();
  const fetchDevices = useServerFn(listConnectorDevices);
  const q = useQuery({
    queryKey: ["connector-devices", id],
    queryFn: () => fetchDevices({ data: { id } }),
  });
  const routers = q.data?.routers ?? [];
  const controllers = q.data?.controllers ?? [];
  if (q.isLoading)
    return <p className="text-xs text-muted-foreground">{t.copy("Loading devices…")}</p>;
  if (routers.length + controllers.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        {t.copy(
          "No devices routed through this connector yet. Pick “Local Connector” on a router or access point controller to bind it here.",
        )}
      </p>
    );

  return (
    <ul className="space-y-1">
      {routers.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between rounded-md border border-border/50 bg-surface/50 px-3 py-1.5 text-xs"
        >
          <span>
            <strong>{r.name}</strong>{" "}
            <span className="text-muted-foreground">
              · router · {r.host}:{r.port}
            </span>
          </span>
        </li>
      ))}
      {controllers.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between rounded-md border border-border/50 bg-surface/50 px-3 py-1.5 text-xs"
        >
          <span>
            <strong>{c.name}</strong>{" "}
            <span className="text-muted-foreground">
              · {c.brand} controller · {c.host}:{c.port}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const STATE_TONE: Record<string, string> = {
  connected: "border-emerald-500/40 text-emerald-300",
  configuring: "border-sky-500/40 text-sky-300",
  authenticating: "border-sky-500/40 text-sky-300",
  discovered: "border-border text-muted-foreground",
  offline: "border-amber-500/40 text-amber-300",
  error: "border-red-500/40 text-red-300",
};

function DiscoveredRouters({ id }: { id: string }) {
  const t = useT();
  const fetchDiscovered = useServerFn(listDiscoveredRouters);
  const q = useQuery({
    queryKey: ["connector-discovered", id],
    queryFn: () => fetchDiscovered({ data: { id } }),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  const rows = q.data ?? [];

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold">{t.label("Discovered routers")}</h4>
      <p className="text-[11px] text-muted-foreground">
        {t.copy(
          "Found by the local connector on the customer LAN. Run the local setup tool on the connector machine to authenticate and bootstrap a router — the admin password is never entered here.",
        )}
      </p>
      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">{t.copy("Loading…")}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t.copy("Nothing discovered yet. Connect the machine to a router LAN port and rescan.")}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className="space-y-1 rounded-md border border-border/50 bg-surface/50 px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong className="break-all">{r.identity ?? "unknown"}</strong>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    STATE_TONE[r.state] ?? "border-border text-muted-foreground"
                  }`}
                >
                  {r.state}
                </span>
              </div>
              <div className="break-words text-muted-foreground">
                {(r.model ?? "unknown") + " · RouterOS " + (r.os_version ?? "unknown")} ·{" "}
                {r.ip ?? "unknown"} · {r.mac ?? "unknown"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t.copy("Last seen")}: {new Date(r.last_seen_at).toLocaleString()} ·{" "}
                {r.backup_name
                  ? `${t.copy("Backup")}: ${r.backup_name}`
                  : t.copy("No backup recorded")}{" "}
                · {r.has_rollback ? t.copy("Rollback available") : t.copy("No rollback script")}
              </div>
              {r.last_error && <div className="text-red-300">{r.last_error}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border/60 bg-surface/60 px-3 py-2 font-mono text-[11px] leading-relaxed">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            void copyText(value).then((ok) => {
              if (ok) toast.success("Copied");
              else toast.error("Copy failed");
            });
          }}
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
          aria-label={`Copy ${label} command`}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

/** Client-facing install commands pin production except on localhost. */
const origin = connectorInstallOrigin();

function InstallAgentPanel({ code }: { code?: string }) {
  const t = useT();
  const [os, setOs] = useState<"windows" | "macos">(() =>
    detectDesktopOs() === "macos" ? "macos" : "windows",
  );
  const pairing = code || "YOUR-PAIRING-CODE";

  const windowsCmd = `powershell -Command "& { $c='${pairing}'; iwr ${origin}/api/public/connector/install/windows -OutFile $env:TEMP\\mm-install.ps1; & $env:TEMP\\mm-install.ps1 -PairingCode $c -BaseUrl ${origin} }"`;
  const macCmd = `curl -fsSL ${origin}/api/public/connector/install/macos | sudo MIKROMAGIC_BASE_URL=${origin} bash -s ${pairing}`;

  return (
    <section className="glass-panel rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t.label("Install the desktop connector agent")}
        </h2>
        <div className="flex gap-1 rounded-full border border-border p-1 text-xs">
          {(["windows", "macos"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOs(o)}
              className={`rounded-full px-3 py-1 ${
                os === o ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {o === "windows" ? "Windows" : "macOS"}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {t.copy(
          "The agent pairs with a one-time code, heartbeats every 30 seconds and keeps itself up to date with Ed25519-signed, checksum-pinned updates. It only makes outbound HTTPS calls — no inbound ports.",
        )}
      </p>

      {os === "windows" ? (
        <div className="space-y-3">
          <CopyRow label="Run in an elevated PowerShell" value={windowsCmd} />
          <p className="text-xs text-muted-foreground">
            Installs to <code>C:\ProgramData\MikroMagicConnector</code> and registers the{" "}
            <code>MikroMagicConnector</code> scheduled task, which starts at boot and restarts the
            agent automatically after crashes or updates.
          </p>
          <a
            className="inline-block rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
            href="/api/public/connector/install/windows"
            download="mikromagic-connector-install.ps1"
          >
            Download windows-install.ps1
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <CopyRow label="Run in Terminal" value={macCmd} />
          <p className="text-xs text-muted-foreground">
            Installs to <code>/Library/Application Support/MikroMagicConnector</code> and loads the{" "}
            <code>app.mikromagic.connector</code> launchd daemon (KeepAlive). A signed{" "}
            <code>.pkg</code>/<code>.dmg</code> can be built from{" "}
            <code>src/agent/install/build-macos-pkg.sh</code>.
          </p>
          <a
            className="inline-block rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
            href="/api/public/connector/install/macos"
            download="mikromagic-connector-install.sh"
          >
            Download macos-install.sh
          </a>
        </div>
      )}
    </section>
  );
}

function ConnectorsPage() {
  const t = useT();
  const qc = useQueryClient();
  const fetchMe = useServerFn(getMe);
  const fetchConnectors = useServerFn(listConnectors);
  const save = useServerFn(saveConnector);
  const setEnabled = useServerFn(setConnectorEnabled);
  const pair = useServerFn(generatePairingCode);
  const unpair = useServerFn(unpairConnector);
  const remove = useServerFn(deleteConnector);
  const test = useServerFn(testConnector);

  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const connectors = useQuery({
    queryKey: ["connectors"],
    queryFn: () => fetchConnectors(),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });

  const canEdit = !(me.data?.roles?.includes("read_only") || me.data?.roles?.includes("expired"));

  const [name, setName] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [tests, setTests] = useState<Record<string, string>>({});
  const [wizardOpen, setWizardOpen] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["connectors"] });

  const addMutation = useMutation({
    mutationFn: (n: string) => save({ data: { name: n } }),
    onSuccess: () => {
      toast.success("Connector created — generate a pairing code next");
      setName("");
      invalidate();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const codeMutation = useMutation({
    mutationFn: (id: string) => pair({ data: { id } }),
    onSuccess: (res, id) => {
      setCodes((c) => ({ ...c, [id]: res.code }));
      invalidate();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => test({ data: { id } }),
    onSuccess: (res, id) => {
      setTests((t) => ({
        ...t,
        [id]: res.ok
          ? `Reachable${"ms" in res && res.ms ? ` in ${res.ms} ms` : ""}`
          : (res.error ?? "Failed"),
      }));
      if (!res.ok) toast.error(res.error ?? "Connector test failed");
      invalidate();
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const simple = (fn: (id: string) => Promise<unknown>, msg: string) => ({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(msg);
      invalidate();
    },
    onError: (e: unknown) => toast.error(toErrorMessage(e)),
  });

  const enableMutation = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => setEnabled({ data: v }),
    onSuccess: invalidate,
    onError: (e) => toast.error(toErrorMessage(e)),
  });
  const unpairMutation = useMutation(
    simple((id: string) => unpair({ data: { id } }), "Connector unpaired"),
  );
  const deleteMutation = useMutation(
    simple((id: string) => remove({ data: { id } }), "Connector deleted"),
  );

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-[11px] text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link
              to="/app"
              activeOptions={{ exact: true }}
              className="inline-flex min-h-[32px] items-center rounded px-1 hover:text-primary hover:underline"
            >
              {t.label("Home")}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link
              to="/app/routers"
              className="inline-flex min-h-[32px] items-center rounded px-1 hover:text-primary hover:underline"
            >
              {t.label("Routers")}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li aria-current="page" className="px-1 font-semibold text-primary">
            {t.label("Connectors")}
          </li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{t.label("Connectors")}</h1>
          <p className="text-sm text-muted-foreground">
            {t.copy(
              "A local MikroTik Magic Connector runs inside the customer network and dials out to the cloud. Devices bound to it are managed without port forwarding or a public IP. For Starlink without a site PC, pick Magic Hub on Routers instead.",
            )}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setWizardOpen((v) => !v)}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-primary/50 bg-primary/15 px-4 text-sm font-medium text-primary transition hover:bg-primary/25"
          >
            {wizardOpen ? "Hide guided setup" : "Guided setup"}
          </button>
        )}
      </header>

      <RemoteAccessChooser compact />

      {canEdit && wizardOpen && <ConnectorWizard onDone={() => setWizardOpen(false)} />}

      {canEdit && (
        <section className="glass-panel rounded-2xl p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t.label("Add a connector")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              placeholder="Name (e.g. Main site bridge)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              disabled={!name.trim() || addMutation.isPending}
              aria-busy={addMutation.isPending || undefined}
              onClick={() => addMutation.mutate(name.trim())}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 disabled:opacity-50"
            >
              {addMutation.isPending && <ButtonSpinner />}
              {addMutation.isPending ? "Creating…" : "Create connector"}
            </button>
          </div>
        </section>
      )}

      <InstallAgentPanel code={Object.values(codes)[0]} />

      <section className="space-y-3">
        {connectors.isLoading && (
          <DelayedFallback
            loading
            label="Loading connectors"
            fallback={<SkeletonList rows={3} />}
          />
        )}
        {connectors.data?.length === 0 && (
          <div className="glass-panel rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {t.copy(
              "No connectors yet. Create one above, then run the pairing code on the on-site connector.",
            )}
          </div>
        )}

        {connectors.data?.map((c) => (
          <article key={c.id} className="glass-panel rounded-2xl p-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  {c.name} <StatusPill online={c.online} enabled={c.enabled} />
                </h3>
                <p className="font-mono text-xs text-muted-foreground">{c.public_id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => testMutation.mutate(c.id)}
                  disabled={testMutation.isPending}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {testMutation.isPending ? "Testing…" : "Test connection"}
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={() => codeMutation.mutate(c.id)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
                    >
                      Pairing code
                    </button>
                    <button
                      onClick={() => enableMutation.mutate({ id: c.id, enabled: !c.enabled })}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
                    >
                      {c.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Unpair "${c.name}"? It will need a new pairing code.`))
                          unpairMutation.mutate(c.id);
                      }}
                      className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary"
                    >
                      Unpair
                    </button>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${c.name}"? Devices using it fall back to no transport until you change their connection method.`,
                          )
                        )
                          deleteMutation.mutate(c.id);
                      }}
                      className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </header>

            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">{t.label("Last seen")}</dt>
                <dd>
                  {c.last_seen_at ? new Date(c.last_seen_at).toLocaleString() : t.copy("Never")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t.label("Version")}</dt>
                <dd>{c.version ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t.label("Local network")}</dt>
                <dd>
                  {[c.local_ip, c.local_subnet, c.hostname].filter(Boolean).join(" · ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t.label("Devices")}</dt>
                <dd>
                  {c.routers} router{c.routers === 1 ? "" : "s"} · {c.controllers} controller
                  {c.controllers === 1 ? "" : "s"}
                </dd>
              </div>
            </dl>

            {tests[c.id] && (
              <p className="mt-3 rounded-md border border-border/50 bg-surface/50 px-3 py-2 text-xs">
                {tests[c.id]}
              </p>
            )}

            {codes[c.id] && (
              <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
                <p className="text-muted-foreground">
                  {t.copy("One-time pairing code (valid 30 minutes, shown once):")}
                </p>
                <p className="mt-1 font-mono text-base tracking-widest">{codes[c.id]}</p>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.label("Devices through this connector")}
              </div>
              <ConnectorDevices id={c.id} />
              <DiscoveredRouters id={c.id} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
