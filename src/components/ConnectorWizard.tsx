import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import {
  listConnectors,
  saveConnector,
  generatePairingCode,
  testConnector,
} from "@/lib/connectors.functions";
import { connectorInstallOrigin } from "@/lib/connector-install-origin";
import { copyText } from "@/lib/browser/clipboard";
import { detectDesktopOs, type DesktopOs } from "@/lib/browser/platform";
import { toErrorMessage } from "@/lib/error-message";

type StepId = 1 | 2 | 3 | 4;

/** Client-facing install commands pin production except on localhost. */
const origin = connectorInstallOrigin();

const STEP_KEYS = [
  "Name the connector",
  "Pairing code",
  "Install the agent",
  "Verify & bind devices",
] as const;

function Stepper({
  step,
  maxReached,
  onJump,
}: {
  step: StepId;
  maxReached: StepId;
  onJump: (n: StepId) => void;
}) {
  const t = useT();
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STEP_KEYS.map((label, i) => {
        const n = (i + 1) as StepId;
        const state = n < step ? "done" : n === step ? "active" : "todo";
        const bubble = (
          <>
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] " +
                (state === "active"
                  ? "border-primary bg-primary text-primary-foreground"
                  : state === "done"
                    ? "border-primary/60 bg-primary/20 text-primary"
                    : "border-border text-muted-foreground")
              }
            >
              {n}
            </span>
            <span className={state === "todo" ? "text-muted-foreground" : ""}>
              {t.label(label)}
            </span>
          </>
        );
        return (
          <li key={label} className="flex items-center gap-2">
            {n <= maxReached ? (
              <button
                type="button"
                onClick={() => onJump(n)}
                className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/40"
                aria-label={`Go to step ${n}`}
              >
                {bubble}
              </button>
            ) : (
              <span className="flex items-center gap-2">{bubble}</span>
            )}
            {i < STEP_KEYS.length - 1 && <span className="text-muted-foreground">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function CopyBox({ label, value }: { label: string; value: string }) {
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
        >
          Copy
        </button>
      </div>
    </div>
  );
}

/**
 * Guided, click-through setup for a local MikroTik Magic Connector.
 * Mirrors the router Quick setup wizard: named steps, inline checks and a
 * final verification that the agent actually came online.
 */
export function ConnectorWizard({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const create = useServerFn(saveConnector);
  const pair = useServerFn(generatePairingCode);
  const test = useServerFn(testConnector);
  const fetchConnectors = useServerFn(listConnectors);

  const [step, setStep] = useState<StepId>(1);
  const [maxReached, setMaxReached] = useState<StepId>(1);
  const [name, setName] = useState("");
  const [id, setId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [os, setOs] = useState<DesktopOs>(() => detectDesktopOs());

  const go = (n: StepId) => {
    setStep(n);
    setMaxReached((m) => (n > m ? n : m));
  };

  const connectors = useQuery({
    queryKey: ["connectors"],
    queryFn: () => fetchConnectors(),
    refetchInterval: step === 4 ? 5_000 : false,
  });
  const current = connectors.data?.find((c) => c.id === id);

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await create({ data: { name: name.trim() } });
      return res.id;
    },
    onSuccess: (newId) => {
      setId(newId);
      void qc.invalidateQueries({ queryKey: ["connectors"] });
      go(2);
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const codeMut = useMutation({
    mutationFn: async () => pair({ data: { id: id! } }),
    onSuccess: (res) => {
      setCode(res.code);
      go(3);
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const testMut = useMutation({
    mutationFn: async () => test({ data: { id: id! } }),
    onSuccess: (res) => {
      if (res.ok) toast.success("Connector is reachable");
      else toast.error(res.error ?? "Connector is not answering yet");
      void qc.invalidateQueries({ queryKey: ["connectors"] });
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const pairing = code || "YOUR-PAIRING-CODE";
  const windowsCmd = useMemo(
    () =>
      `powershell -Command "& { $c='${pairing}'; iwr ${origin}/api/public/connector/install/windows -OutFile $env:TEMP\\mm-install.ps1; & $env:TEMP\\mm-install.ps1 -PairingCode $c -BaseUrl ${origin} }"`,
    [pairing],
  );
  const macCmd = useMemo(
    () =>
      `curl -fsSL ${origin}/api/public/connector/install/macos | sudo MIKROMAGIC_BASE_URL=${origin} bash -s ${pairing}`,
    [pairing],
  );
  const linuxCmd = useMemo(
    () =>
      `curl -fsSL ${origin}/api/public/connector/install/linux | sudo MIKROMAGIC_BASE_URL=${origin} bash -s ${pairing}`,
    [pairing],
  );
  const setupCmd = useMemo(
    () =>
      os === "windows"
        ? `node "$env:ProgramData\\MikroMagicConnector\\connector-setup.mjs"`
        : os === "macos"
          ? `sudo node "/Library/Application Support/MikroMagicConnector/connector-setup.mjs"`
          : `sudo node /opt/mikromagic-connector/connector-setup.mjs`,
    [os],
  );

  return (
    <section className="glass-panel space-y-4 rounded-2xl p-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">{t.label("Guided connector setup")}</h2>
        <p className="text-xs text-muted-foreground">
          {t.copy(
            "Four steps: name the connector, mint a one-time pairing code, install the agent on a machine inside the customer LAN, then confirm it is online and bind your devices.",
          )}
        </p>
      </header>

      <Stepper step={step} maxReached={maxReached} onJump={go} />

      {step === 1 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t.label("Name the connector")}</h3>
          <p className="text-xs text-muted-foreground">
            {t.copy(
              "Use the site name so you can tell bridges apart later, for example “Main site bridge”.",
            )}
          </p>
          <input
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            placeholder="Main site bridge"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            disabled={!name.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {createMut.isPending ? "Creating…" : "Create connector"}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t.label("Pairing code")}</h3>
          <p className="text-xs text-muted-foreground">
            {t.copy(
              "The pairing code is shown once and expires in 30 minutes. The agent exchanges it for a permanent token on first contact.",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!id || codeMut.isPending}
              onClick={() => codeMut.mutate()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {codeMut.isPending ? "Generating…" : "Generate pairing code"}
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t.label("Install the agent")}</h3>
          <p className="text-xs text-muted-foreground">
            {t.copy(
              "Run the command on any always-on Windows or macOS machine in the same LAN as the routers and access points. It installs a background service that only makes outbound HTTPS calls — no port forwarding.",
            )}
          </p>
          {code && (
            <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
              <p className="text-muted-foreground">
                {t.copy("One-time pairing code (valid 30 minutes, shown once):")}
              </p>
              <p className="mt-1 font-mono text-base tracking-widest">{code}</p>
            </div>
          )}
          <div className="flex gap-1 rounded-full border border-border p-1 text-xs w-fit">
            {(["windows", "macos", "linux"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOs(o)}
                className={`rounded-full px-3 py-1 ${
                  os === o ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {o === "windows" ? "Windows" : o === "macos" ? "macOS" : "Linux"}
              </button>
            ))}
          </div>
          <CopyBox
            label={
              os === "windows" ? t.copy("Run in an elevated PowerShell") : t.copy("Run in Terminal")
            }
            value={os === "windows" ? windowsCmd : os === "macos" ? macCmd : linuxCmd}
          />

          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs space-y-2">
            <p className="font-medium text-amber-200">
              {t.copy("Then set the router up locally on that same machine")}
            </p>
            <p className="text-muted-foreground">
              {t.copy(
                "Plug an Ethernet cable from that computer into any RB4011 LAN port (ether2 – ether10) yourself — this is a manual step the app cannot perform. Then run the local setup tool. It asks for the router username and password on that computer only: they are never typed into this page and never sent to MikroMagic.",
              )}
            </p>
            <CopyBox label={t.copy("Local setup tool")} value={setupCmd} />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => go(4)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => go(2)}
              className="rounded-md border border-border px-4 py-2 text-sm"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t.label("Verify & bind devices")}</h3>
          <p className="text-xs text-muted-foreground">
            {t.copy(
              "The agent heartbeats every 30 seconds. Once it shows Online, open Routers or Advanced → AP integrations, pick “Local Connector” as the connection method and select this connector.",
            )}
          </p>
          <div className="rounded-md border border-border/60 bg-surface/50 px-3 py-2 text-xs">
            <div>
              <span className="text-muted-foreground">{t.label("Status")}: </span>
              {current
                ? current.online
                  ? t.copy("Online")
                  : t.copy("Waiting for first heartbeat…")
                : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">{t.label("Last seen")}: </span>
              {current?.last_seen_at
                ? new Date(current.last_seen_at).toLocaleString()
                : t.copy("Never")}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!id || testMut.isPending}
              onClick={() => testMut.mutate()}
              className="rounded-md border border-border px-4 py-2 text-sm hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {testMut.isPending ? "Testing…" : "Test connection"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1);
                setMaxReached(1);
                setName("");
                setId(null);
                setCode("");
                onDone?.();
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Finish
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
