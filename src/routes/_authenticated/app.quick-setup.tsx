import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { saveRouter, testRouter, testConnection } from "@/lib/routers.functions";
import {
  probeCloudDns,
  checkPublicReachability,
  executeQuickSetupRollback,
} from "@/lib/mikrotik.functions";
import { buildQuickSetupRollbackScript, buildQuickSetupScript } from "@/lib/quick-setup-script";
import { RemoteAccessChooser } from "@/components/RemoteAccessChooser";
import { copyText } from "@/lib/browser/clipboard";
import { toErrorMessage } from "@/lib/error-message";

export const Route = createFileRoute("/_authenticated/app/quick-setup")({
  head: () => ({
    meta: [{ title: "Quick setup — MikroTik Magic" }, { name: "robots", content: "noindex" }],
  }),
  component: QuickSetup,
});

type StepId = 1 | 2 | 3 | 4 | 5;

function randomPassword(len = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

const DRAFT_KEY = "mm.quicksetup.draft.v1";
type Draft = {
  step: StepId;
  name: string;
  identity: string;
  apiUser: string;
  lanIp: string;
  ddnsHost: string;
  savedAt: string;
};

const INTRO_KEY = "mm.quick-setup.intro.v1";

function QuickSetup() {
  const [step, setStep] = useState<StepId>(1);
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");
  const [apiUser, setApiUser] = useState("");
  const [apiPassword, setApiPassword] = useState("");
  const [ddnsHost, setDdnsHost] = useState("");
  const [savedRouterId, setSavedRouterId] = useState<string | null>(null);
  const [lanIp, setLanIp] = useState("192.168.88.1");
  const [backupTag] = useState(
    () =>
      `pre-magic-${new Date()
        .toISOString()
        .replace(/[-:T.Z]/g, "")
        .slice(0, 14)}`,
  );
  const [resumeAvailable, setResumeAvailable] = useState<Draft | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [introSlide, setIntroSlide] = useState(0);
  const hydratedRef = useRef(false);

  // Decide whether to show the intro click-through on mount.
  useEffect(() => {
    try {
      const forced = typeof window !== "undefined" && window.location.search.includes("intro=1");
      const seen = typeof window !== "undefined" && localStorage.getItem(INTRO_KEY) === "1";
      const hasDraft = typeof window !== "undefined" && !!localStorage.getItem(DRAFT_KEY);
      if (forced || (!seen && !hasDraft)) setShowIntro(true);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Load draft on mount (never persist password)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (d && typeof d.step === "number" && d.step > 1) setResumeAvailable(d);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Persist on change (skip step 5 done-state until reset)
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    if (step === 1 && !name && !identity && !apiUser) return;
    try {
      const draft: Draft = {
        step,
        name,
        identity,
        apiUser,
        lanIp,
        ddnsHost,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable */
    }
  }, [step, name, identity, apiUser, lanIp, ddnsHost]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    setResumeAvailable(null);
  };

  const resumeDraft = () => {
    if (!resumeAvailable) return;
    setName(resumeAvailable.name);
    setIdentity(resumeAvailable.identity);
    setApiUser(resumeAvailable.apiUser);
    setLanIp(resumeAvailable.lanIp || "192.168.88.1");
    setDdnsHost(resumeAvailable.ddnsHost);
    setStep(resumeAvailable.step);
    setResumeAvailable(null);
  };

  // Per-step validation
  const step1Errors = useMemo(() => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("Router name is required.");
    if (!identity.trim()) errs.push("System identity is required.");
    else if (!/^[a-zA-Z0-9._-]+$/.test(identity))
      errs.push("Identity may only contain letters, digits, . _ -");
    if (!apiUser.trim()) errs.push("API username is required.");
    else if (!/^[a-zA-Z0-9._-]+$/.test(apiUser))
      errs.push("API username may only contain letters, digits, . _ -");
    if (!apiPassword) errs.push("API password is required.");
    else if (apiPassword.length < 8) errs.push("API password should be at least 8 characters.");
    return errs;
  }, [name, identity, apiUser, apiPassword]);
  const step1Valid = step1Errors.length === 0;

  const qc = useQueryClient();
  const navigate = useNavigate();
  const save = useServerFn(saveRouter);
  const test = useServerFn(testRouter);
  const probe = useServerFn(probeCloudDns);
  const reachability = useServerFn(checkPublicReachability);
  const runRollback = useServerFn(executeQuickSetupRollback);

  const rollbackMut = useMutation({
    mutationFn: async (mode: "soft" | "hard") => {
      const host = ddnsHost.trim();
      if (!host) {
        throw new Error(
          "Enter the Cloud DDNS hostname first. One-click rollback runs from the cloud and cannot dial a LAN IP — use Download .rsc in Winbox if you only have a LAN address.",
        );
      }
      if (!apiUser.trim() || !apiPassword)
        throw new Error("API username/password required (Step 1).");
      const res = await runRollback({
        data: {
          host,
          port: 443,
          username: apiUser.trim(),
          password: apiPassword,
          useTls: true,
          apiUser: apiUser.trim(),
          backupTag,
          mode,
          // The wizard installed a self-signed certificate on this router.
          allowSelfSigned: true,
        },
      });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
  });

  const script = useMemo(
    () => buildQuickSetupScript({ apiUser, apiPassword, identity, backupTag }),
    [apiUser, apiPassword, identity, backupTag],
  );
  const rollbackScript = useMemo(
    () => buildQuickSetupRollbackScript({ apiUser, backupTag }),
    [apiUser, backupTag],
  );

  const reachMut = useMutation({
    mutationFn: async (host?: string) =>
      reachability({ data: { host: host?.trim() || undefined, port: 443 } }),
  });

  const detectMut = useMutation({
    mutationFn: async () => {
      const host = ddnsHost.trim();
      if (!host) {
        throw new Error(
          "Paste the Cloud DDNS hostname the setup script printed (e.g. xxx.sn.mynetname.net). This app runs in the cloud and cannot dial your LAN IP.",
        );
      }
      if (!apiUser.trim() || !apiPassword)
        throw new Error("Enter the API username and password in Step 1 first.");
      const res = await probe({
        data: { host, port: 443, username: apiUser.trim(), password: apiPassword, useTls: true },
      });

      if (!res.ok) throw new Error(res.error);
      setDdnsHost(res.dnsName);
      return res;
    },
  });

  const testConn = useServerFn(testConnection);
  const testConnMut = useMutation({
    mutationFn: async () => {
      const host = ddnsHost.trim();
      if (!host) throw new Error("Enter (or auto-detect) the Cloud DDNS hostname first.");
      if (!apiUser.trim() || !apiPassword)
        throw new Error("API username and password are required (Step 1).");
      const res = await testConn({
        data: { host, port: 443, username: apiUser.trim(), password: apiPassword, useTls: true },
      });
      if (!res.ok) throw new Error(res.error ?? "Connection test failed");
      return res;
    },
  });

  const registerMut = useMutation({
    mutationFn: async () => {
      const host = ddnsHost.trim();
      if (!host) throw new Error("Enter the Cloud DDNS hostname from the router.");
      if (!testConnMut.data?.ok)
        throw new Error("Run the connection test successfully before saving.");
      const res = await save({
        data: {
          name,
          host,
          port: 443,
          username: apiUser,
          password: apiPassword,
          useTls: true,
          allowInsecureTls: true,
          insecureTlsReason:
            "Quick Setup installs a self-signed certificate on the router; recorded as a temporary exception.",
          isDefault: false,
        },
      });
      setSavedRouterId(res.id);
      // Confirm the saved record is reachable end-to-end (uses the encrypted password).
      const t = await test({ data: { id: res.id } });
      if (!t.ok) throw new Error(t.error ?? "Router saved but not reachable");
      await qc.invalidateQueries({ queryKey: ["routers"] });
      return t;
    },
    onSuccess: () => {
      setStep(5);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* storage unavailable */
      }
      toast.success(`Router "${name}" created and reachable`, {
        description: "Redirecting to Routers…",
      });
      setTimeout(() => {
        navigate({ to: "/app/routers" });
      }, 900);
    },
  });

  // Invalidate a prior successful test if the user edits inputs afterwards —
  // they must re-test before we let them create the router.
  const testResetRef = useRef(testConnMut.reset);
  testResetRef.current = testConnMut.reset;
  const registerResetRef = useRef(registerMut.reset);
  registerResetRef.current = registerMut.reset;
  useEffect(() => {
    testResetRef.current();
    registerResetRef.current();
  }, [ddnsHost, apiUser, apiPassword]);

  const busy = testConnMut.isPending || registerMut.isPending;
  const busyLabel = registerMut.isPending
    ? "Creating router…"
    : testConnMut.isPending
      ? "Testing connection…"
      : "";

  const downloadFile = (content: string, filename: string) => {
    try {
      const blob = new Blob([content], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      toast.success(`Downloaded ${filename}`);
    } catch (e) {
      toast.error(toErrorMessage(e, "Download failed"));
    }
  };
  const downloadRsc = () => downloadFile(script, "magicsetup.rsc");
  const downloadRollback = () => downloadFile(rollbackScript, "rollback.rsc");

  const copyScript = async () => {
    const ok = await copyText(script);
    if (ok) toast.success("Setup script copied");
    else toast.error("Copy failed — use Download instead");
  };
  const copyRollback = async () => {
    const ok = await copyText(rollbackScript);
    if (ok) toast.success("Rollback script copied");
    else toast.error("Copy failed — use Download instead");
  };

  const openWinbox = () => {
    const target = lanIp.trim() || "MikroTik";
    window.location.href = `winbox://${encodeURIComponent(target)}`;
  };

  // Auto-run reachability once when reaching step 2
  const reachAutoRef = useRef(false);
  useEffect(() => {
    if (step === 2 && !reachAutoRef.current && !reachMut.data && !reachMut.isPending) {
      reachAutoRef.current = true;
      reachMut.mutate(undefined);
    }
  }, [step, reachMut]);

  const highestStep = useRef<StepId>(1);
  if (step > highestStep.current) highestStep.current = step;

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      {showIntro && (
        <IntroTour
          slide={introSlide}
          onNext={() => setIntroSlide((s) => Math.min(s + 1, 3))}
          onBack={() => setIntroSlide((s) => Math.max(s - 1, 0))}
          onStart={() => {
            try {
              localStorage.setItem(INTRO_KEY, "1");
            } catch {
              /* storage unavailable */
            }
            setShowIntro(false);
          }}
          onSkip={() => {
            try {
              localStorage.setItem(INTRO_KEY, "1");
            } catch {
              /* storage unavailable */
            }
            setShowIntro(false);
          }}
        />
      )}
      {!showIntro && <RemoteAccessChooser compact />}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Quick setup</h1>
          <button
            type="button"
            onClick={() => {
              setIntroSlide(0);
              setShowIntro(true);
            }}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
          >
            Show tour
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Guided wizard to expose RouterOS REST — Cloud DDNS, self-signed TLS on 443, and a
          dedicated API user, all in one script. Use this when the router can be reached from the
          internet.
        </p>
        <div className="rounded-xl border border-border bg-card/50 p-3 text-xs text-muted-foreground">
          <b className="text-foreground">No public IP or CGNAT?</b> Skip this wizard and pair a
          local MikroTik Magic Connector instead: install the agent on an always-on machine in the
          same LAN, then set the router's connection method to “Local Connector”. Nothing is exposed
          to the internet.{" "}
          <Link to="/app/connectors" className="text-primary underline underline-offset-2">
            Open the connector setup wizard
          </Link>
          .
        </div>
      </header>

      {resumeAvailable && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
          <div>
            <div className="font-medium">Resume where you left off?</div>
            <div className="text-xs text-muted-foreground">
              Draft from {new Date(resumeAvailable.savedAt).toLocaleString()} · Step{" "}
              {resumeAvailable.step} · {resumeAvailable.name || "(unnamed router)"}. Password isn't
              stored — you'll re-enter it.
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button className="btn-primary min-h-[44px]" onClick={resumeDraft} type="button">
              Resume
            </button>
            <button className="btn-ghost min-h-[44px]" onClick={clearDraft} type="button">
              Start fresh
            </button>
          </div>
        </div>
      )}

      <div className="sticky top-2 z-10 -mx-1 rounded-xl border border-border bg-background/85 px-3 py-2 backdrop-blur-md sm:-mx-1 sm:px-2">
        <Stepper
          step={step}
          maxReached={highestStep.current}
          onJump={(n) => n <= highestStep.current && setStep(n)}
          disabled={busy}
        />
        {busy && (
          <div className="mt-2" role="status" aria-live="polite">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
              <div className="h-full w-1/3 animate-[qs-progress_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
                aria-hidden="true"
              />
              {busyLabel}
            </div>
            <style>{`@keyframes qs-progress{0%{transform:translateX(-100%)}50%{transform:translateX(100%)}100%{transform:translateX(300%)}}`}</style>
          </div>
        )}
      </div>

      {step === 1 && (
        <Card title="Step 1 · Name & credentials">
          <div className="space-y-4">
            <Field label="Router name (shown in this app)">
              <input
                className="input min-h-[44px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hotspot RouterBoard"
                maxLength={80}
                aria-invalid={!name.trim() && step1Errors.length > 0}
              />
            </Field>
            <Field label="RouterOS system identity">
              <input
                className="input min-h-[44px]"
                value={identity}
                onChange={(e) => setIdentity(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))}
                placeholder="e.g. mikrotik-hotspot"
                maxLength={40}
              />
            </Field>
            <Field label="API username (created on the router)">
              <input
                className="input min-h-[44px]"
                value={apiUser}
                onChange={(e) => setApiUser(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))}
                placeholder="e.g. mikrotik-magic"
                maxLength={40}
              />
            </Field>
            <Field label="API password">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="input w-full font-mono min-h-[44px]"
                  value={apiPassword}
                  onChange={(e) => setApiPassword(e.target.value)}
                  placeholder="e.g. JXvkLmipLfntMSpMniV5"
                  maxLength={64}
                />
                <button
                  className="btn-ghost w-full whitespace-nowrap min-h-[44px] sm:w-auto"
                  onClick={() => void copyText(apiPassword)}
                  type="button"
                >
                  Copy
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Enter your own password (8+ chars). Save it now — the app stores it encrypted after
                Step 4.
              </p>
            </Field>

            {!step1Valid && (name || identity || apiUser || apiPassword) && (
              <ul className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-100">
                {step1Errors.map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                className="btn-primary w-full min-h-[44px] disabled:opacity-50 sm:w-auto"
                onClick={() => setStep(2)}
                disabled={!step1Valid}
              >
                Continue
              </button>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="Step 2 · Open Winbox on the RouterBoard">
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              Connect your laptop to the RouterBoard (LAN cable or Wi-Fi) and open the Winbox
              desktop app.
            </li>
            <li>
              In Winbox's <em>Neighbors</em> tab, click your RouterBoard's MAC or IP and sign in.
            </li>
            <li>
              Optional shortcut on Windows/macOS with Winbox installed:
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <input
                  className="input w-full min-h-[44px] sm:w-[200px]"
                  value={lanIp}
                  onChange={(e) => setLanIp(e.target.value)}
                  placeholder="192.168.88.1"
                />
                <button
                  className="btn-ghost w-full min-h-[44px] sm:w-auto"
                  onClick={openWinbox}
                  type="button"
                >
                  Open Winbox at this address
                </button>
              </div>
            </li>
          </ol>

          <ReachabilityPanel state={reachMut} onRun={() => reachMut.mutate(undefined)} />

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button className="btn-ghost w-full min-h-[44px] sm:w-auto" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="btn-primary w-full min-h-[44px] sm:w-auto"
              onClick={() => setStep(3)}
            >
              Winbox is open — continue
            </button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="Step 3 · Download & run on the router">
          <p className="text-sm text-muted-foreground">
            Two files. Download the first, run it in Winbox. Keep the second in case you need to
            undo.
          </p>

          <div className="mt-4 space-y-3">
            <ScriptRow
              badge="1"
              tone="primary"
              filename="magicsetup.rsc"
              title="Setup script"
              subtitle="Enables DDNS, TLS on 443 (www-ssl), WAN firewall for REST, and creates your API user."
              onDownload={downloadRsc}
              onCopy={copyScript}
            />
            <ScriptRow
              badge="2"
              tone="ghost"
              filename="rollback.rsc"
              title="Rollback script"
              subtitle="Optional — only run this if setup breaks something."
              onDownload={downloadRollback}
              onCopy={copyRollback}
            />
          </div>

          <div className="mt-5 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm sm:p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
              How to run it
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-foreground/90">
              <li>
                Open <strong>Winbox → Files</strong> and drag <code>magicsetup.rsc</code> into the
                window.
              </li>
              <li>
                Open <strong>New Terminal</strong> and run: <code>/import magicsetup.rsc</code>
              </li>
              <li>
                Wait until it prints <strong>Setup complete</strong>, then copy the{" "}
                <strong>Cloud DDNS hostname</strong> (Host line).
              </li>
            </ol>
          </div>

          <details className="mt-4 rounded-lg border border-border/60 bg-black/20 text-xs">
            <summary className="cursor-pointer px-3 py-2 text-muted-foreground hover:text-foreground">
              Preview script · backup tag <code>{backupTag}</code>
            </summary>
            <pre className="max-h-64 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
              {script}
            </pre>
          </details>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button className="btn-ghost w-full min-h-[44px] sm:w-auto" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="btn-primary w-full min-h-[44px] sm:w-auto"
              onClick={() => setStep(4)}
            >
              Script has run — continue
            </button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card title="Step 4 · Register & test the connection">
          <Field label="Cloud DDNS hostname">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <input
                className="input w-full min-h-[44px] sm:flex-1 sm:min-w-[240px]"
                value={ddnsHost}
                onChange={(e) => setDdnsHost(e.target.value.trim())}
                placeholder="abc123xyz.sn.mynetname.net"
              />
              <button
                type="button"
                className="btn-ghost w-full min-h-[44px] whitespace-nowrap sm:w-auto"
                onClick={() => detectMut.mutate()}
                disabled={detectMut.isPending || !ddnsHost.trim()}
                title="Reads /ip cloud over the public DDNS hostname (cloud cannot dial LAN IPs)"
              >
                {detectMut.isPending ? "Verifying…" : "Verify DDNS hostname"}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste the Host value from the setup script terminal. Verify confirms DDNS is enabled
              and returns the canonical dns-name over <code>:443</code>. This app cannot dial your
              LAN IP from the cloud — use Local Connector for LAN-only sites.
            </p>
            {detectMut.isError && (
              <p className="mt-2 text-xs text-destructive">{(detectMut.error as Error).message}</p>
            )}
            {detectMut.data && "ok" in detectMut.data && detectMut.data.ok && (
              <p className="mt-2 text-xs text-emerald-400">
                Verified <code>{detectMut.data.dnsName}</code>
                {detectMut.data.publicAddress ? ` → ${detectMut.data.publicAddress}` : ""}
              </p>
            )}
          </Field>
          {registerMut.isError && (
            <div className="mt-3 space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="text-destructive">
                <b>Connection test failed:</b> {(registerMut.error as Error).message}
              </div>
              <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                <div className="mb-2 font-semibold text-amber-200">Roll back the router</div>
                Something isn't reachable — revert the last changes before troubleshooting.
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    className="btn-primary w-full min-h-[44px] sm:w-auto"
                    onClick={() => {
                      if (
                        confirm(
                          "Run soft rollback now?\n\nThis connects to the router with the wizard credentials and removes only what the setup added (API user, cert, disables www-ssl). DDNS/DNS/identity are kept.",
                        )
                      ) {
                        rollbackMut.mutate("soft");
                      }
                    }}
                    disabled={rollbackMut.isPending}
                    type="button"
                  >
                    {rollbackMut.isPending && rollbackMut.variables === "soft"
                      ? "Rolling back…"
                      : "One-click rollback (soft)"}
                  </button>
                  <button
                    className="btn-ghost w-full min-h-[44px] sm:w-auto"
                    onClick={() => {
                      if (
                        confirm(
                          `Hard restore will run /system backup load name=${backupTag} on the router. This reverts EVERYTHING (DDNS, DNS, identity) and REBOOTS the router. Continue?`,
                        )
                      ) {
                        rollbackMut.mutate("hard");
                      }
                    }}
                    disabled={rollbackMut.isPending}
                    type="button"
                  >
                    {rollbackMut.isPending && rollbackMut.variables === "hard"
                      ? "Restoring…"
                      : "Hard restore + reboot"}
                  </button>
                  <div className="grid grid-cols-2 gap-2 sm:contents">
                    <button
                      className="btn-ghost min-h-[44px] sm:min-h-0"
                      onClick={downloadRollback}
                      type="button"
                    >
                      Download .rsc
                    </button>
                    <button
                      className="btn-ghost min-h-[44px] sm:min-h-0"
                      onClick={copyRollback}
                      type="button"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                {rollbackMut.isSuccess && (
                  <p className="mt-2 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-100">
                    ✓ {rollbackMut.data.message}
                  </p>
                )}
                {rollbackMut.isError && (
                  <p className="mt-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                    Rollback failed: {(rollbackMut.error as Error).message}. Use the download/copy
                    fallback and import in Winbox.
                  </p>
                )}
                <details open className="mt-2">
                  <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wider opacity-80 sm:hidden">
                    What do these do?
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>
                      <b>One-click soft:</b> we run the rollback for you over the same REST
                      connection — no Winbox needed.
                    </li>
                    <li>
                      <b>Fallback:</b> if REST is unreachable, download/copy the .rsc and import via
                      Winbox → Files.
                    </li>
                    <li>
                      <b>Hard restore:</b> loads binary backup <code>{backupTag}</code>; router
                      reboots to pre-setup state.
                    </li>
                  </ul>
                </details>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Show rollback script
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono">
                  {rollbackScript}
                </pre>
              </details>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-border bg-surface/40 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium">Test the connection</div>
                <div className="text-xs text-muted-foreground">
                  Uses host <code>{ddnsHost || "<hostname>"}</code>:443 with API user{" "}
                  <code>{apiUser || "<user>"}</code>. The router is only created after the test
                  succeeds.
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost inline-flex w-full min-h-[44px] items-center justify-center gap-2 whitespace-nowrap sm:w-auto"
                onClick={() => testConnMut.mutate()}
                disabled={busy || !ddnsHost || !apiUser || !apiPassword}
              >
                {testConnMut.isPending && (
                  <span
                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden="true"
                  />
                )}
                {testConnMut.isPending
                  ? "Testing…"
                  : testConnMut.data?.ok
                    ? "Re-test"
                    : "Test connection"}
              </button>
            </div>
            {(testConnMut.data || testConnMut.isError) && (
              <ul className="mt-3 space-y-1 text-xs">
                {testConnMut.data?.steps?.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={
                        s.status === "ok"
                          ? "text-emerald-400"
                          : s.status === "fail"
                            ? "text-destructive"
                            : s.status === "warn"
                              ? "text-amber-400"
                              : "text-muted-foreground"
                      }
                      aria-hidden="true"
                    >
                      {s.status === "ok"
                        ? "✓"
                        : s.status === "fail"
                          ? "✕"
                          : s.status === "warn"
                            ? "!"
                            : "·"}
                    </span>
                    <span className="min-w-0">
                      <b>{s.name}</b>
                      {s.detail ? (
                        <>
                          {" "}
                          — <span className="text-muted-foreground">{s.detail}</span>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
                {testConnMut.isError && (
                  <li className="text-destructive">{(testConnMut.error as Error).message}</li>
                )}
                {testConnMut.data?.ok && (
                  <li className="mt-1 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-200">
                    ✓ Reachable. You can now create the router.
                  </li>
                )}
                {testConnMut.data &&
                !testConnMut.data.ok &&
                testConnMut.data.remediation?.length ? (
                  <li className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-amber-100">
                    <div className="mb-1 font-semibold">Fix checklist</div>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {testConnMut.data.remediation.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button
              className="btn-ghost w-full min-h-[44px] sm:w-auto"
              onClick={() => setStep(3)}
              disabled={busy}
            >
              Back
            </button>
            <button
              className="btn-primary inline-flex w-full min-h-[44px] items-center justify-center gap-2 sm:w-auto"
              onClick={() => registerMut.mutate()}
              disabled={busy || !testConnMut.data?.ok}
              title={
                !testConnMut.data?.ok ? "Run the connection test successfully first" : undefined
              }
            >
              {registerMut.isPending && (
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
              )}
              {registerMut.isPending ? "Creating…" : "Create router"}
            </button>
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card title="✓ You're good to go">
          <p className="text-sm">
            <strong>{name}</strong> is registered and reachable from the cloud at{" "}
            <code>{ddnsHost}</code>. Head to Live users, Vouchers, or the Portal editor to start
            managing it.
          </p>
          {savedRouterId && (
            <p className="mt-2 text-xs text-muted-foreground">
              Stored under router id <code>{savedRouterId}</code>.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a
              href="/app/routers"
              className="btn-primary inline-flex w-full min-h-[44px] items-center justify-center sm:w-auto"
            >
              Open Routers
            </a>
            <a
              href="/app/live"
              className="btn-ghost inline-flex w-full min-h-[44px] items-center justify-center sm:w-auto"
            >
              Live users
            </a>
            <button
              className="btn-ghost w-full min-h-[44px] sm:w-auto"
              onClick={() => {
                setStep(1);
                setSavedRouterId(null);
                setDdnsHost("");
                setApiPassword("");
              }}
            >
              Set up another router
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stepper({
  step,
  maxReached,
  onJump,
  disabled,
}: {
  step: StepId;
  maxReached?: StepId;
  onJump?: (n: StepId) => void;
  disabled?: boolean;
}) {
  const labels = ["Credentials", "Open Winbox", "Run script", "Register", "Done"];
  const reached = maxReached ?? step;
  return (
    <>
      {/* Compact tracker for phones */}
      <div className="flex items-center gap-3 sm:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary bg-primary text-[11px] font-semibold text-primary-foreground">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{labels[step - 1]}</div>
          <div className="text-[11px] text-muted-foreground">
            Step {step} of {labels.length}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {labels.map((label, i) => {
            const n = (i + 1) as StepId;
            const jumpable = onJump && n <= reached && n !== step;
            const pill =
              n === step
                ? "w-5 bg-primary"
                : n < step
                  ? "w-1.5 bg-primary/50"
                  : "w-1.5 bg-muted-foreground/30";
            return jumpable ? (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => onJump!(n)}
                aria-label={`Go to step ${n}: ${label}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-all disabled:opacity-50"
              >
                <span className={`h-1.5 rounded-full transition-all ${pill}`} aria-hidden />
              </button>
            ) : (
              <span
                key={label}
                className="inline-flex h-11 w-11 items-center justify-center"
                aria-hidden="true"
              >
                <span className={`h-1.5 rounded-full transition-all ${pill}`} />
              </span>
            );
          })}
        </div>
      </div>

      {/* Full tracker from small screens up */}
      <ol className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:flex">
        {labels.map((label, i) => {
          const n = (i + 1) as StepId;
          const state = n < step ? "done" : n === step ? "active" : "todo";
          const jumpable = onJump && n <= reached;
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
              <span className={state === "todo" ? "text-muted-foreground" : ""}>{label}</span>
            </>
          );
          return (
            <li key={label} className="flex items-center gap-2">
              {jumpable ? (
                <button
                  type="button"
                  onClick={() => onJump!(n)}
                  disabled={disabled}
                  className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Go to step ${n}: ${label}`}
                >
                  {bubble}
                </button>
              ) : (
                <span className="flex items-center gap-2">{bubble}</span>
              )}
              {i < labels.length - 1 && <span className="text-muted-foreground">→</span>}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Card({
  title,
  children,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <section className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-2xl transition-all hover:border-primary/30 sm:p-8">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl transition-all group-hover:bg-primary/20" />
      <div className="relative flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/20">
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </span>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground/60">{hint}</p>}
    </label>
  );
}

function ScriptRow({
  badge,
  tone,
  filename,
  title,
  subtitle,
  onDownload,
  onCopy,
}: {
  badge: string;
  tone: "primary" | "ghost";
  filename: string;
  title: string;
  subtitle: string;
  onDownload: () => void;
  onCopy: () => void;
}) {
  const accent =
    tone === "primary"
      ? "from-primary/25 via-primary/10 to-transparent border-primary/40"
      : "from-accent/15 via-accent/5 to-transparent border-border";
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br ${accent} p-3 backdrop-blur-xl transition hover:border-primary/60 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-4`}
    >
      <div className="flex items-start gap-3 sm:contents">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/15 text-sm font-semibold text-primary sm:h-11 sm:w-11">
          {badge}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <code className="rounded-md border border-border/60 bg-black/30 px-1.5 py-0.5 text-[11px] text-primary">
              {filename}
            </code>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:truncate">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0">
        <button
          type="button"
          onClick={onDownload}
          className={
            tone === "primary"
              ? "btn-primary min-h-[44px] whitespace-nowrap sm:min-h-[40px]"
              : "btn-ghost min-h-[44px] whitespace-nowrap sm:min-h-[40px]"
          }
        >
          ↓ Download
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="btn-ghost min-h-[44px] whitespace-nowrap sm:min-h-[40px]"
          title="Copy script to clipboard"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

type ReachResult = Awaited<ReturnType<typeof checkPublicReachability>>;
type ReachState = ReturnType<typeof useMutation<ReachResult, Error, string | undefined>>;

function ReachabilityPanel({ state, onRun }: { state: ReachState; onRun: () => void }) {
  const d = state.data;
  const isPending = state.isPending;

  return (
    <div
      className={`mt-6 relative overflow-hidden rounded-2xl border p-5 transition-all duration-500 ${
        isPending
          ? "border-primary/40 bg-primary/5"
          : d?.ok
            ? "border-emerald-500/40 bg-emerald-500/10"
            : d
              ? "border-amber-500/40 bg-amber-500/10"
              : "border-border bg-muted/10"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isPending && (
            <div className="relative flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex h-4 w-4 rounded-full bg-primary"></span>
            </div>
          )}
          <span className="text-sm font-bold uppercase tracking-wider">Public Reachability</span>
        </div>
        <button
          className="btn-ghost h-8 px-3 text-xs transition-all hover:bg-primary/20"
          type="button"
          onClick={onRun}
          disabled={isPending}
        >
          {isPending ? "Probing..." : d ? "Re-run" : "Run check"}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          Verifying that your WAN address is reachable on port 443. This ensures the Cloud DDNS
          setup will work perfectly.
        </p>
        {d && (
          <ul className="grid grid-cols-1 gap-2 mt-3">
            {d.target && (
              <li className="flex items-center gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Target:{" "}
                <code className="text-primary">
                  {d.target}:{d.port ?? 443}
                </code>
              </li>
            )}
            {d.classification && (
              <li className="flex items-center gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Network: <b className="text-foreground">{d.classification.kind}</b> —{" "}
                {d.classification.reason}
              </li>
            )}
            {d.ok && (
              <li className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />✓ Securely
                reachable from Cloud
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ============= Intro click-through tour =============
type IntroSlide = {
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
  tint: string;
  icon: React.ReactNode;
};

const INTRO_SLIDES: IntroSlide[] = [
  {
    eyebrow: "Welcome",
    title: "Let's connect your MikroTik",
    body: "This wizard exposes RouterOS REST securely so this app can manage your hotspot from anywhere — no port-forwards to memorize, no manual certs.",
    bullets: [
      "Takes about 5 minutes end-to-end",
      "Safe by default — a full backup runs before any change",
      "You can roll back with one click at any time",
    ],
    tint: "radial-gradient(circle at 30% 30%, #22d3ee, #6366f1 60%, transparent)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 4l1.2 2.8L19 8l-2.8 1.2L15 12l-1.2-2.8L11 8l2.8-1.2L15 4z" />
        <path d="M4 20l9-9" />
      </svg>
    ),
  },
  {
    eyebrow: "What you'll need",
    title: "A laptop on the same LAN",
    body: "You need Winbox (or WebFig) access to the router, plus admin credentials. Your laptop should be on the same LAN so we can auto-detect the DDNS name.",
    bullets: [
      "Router LAN IP (default 192.168.88.1)",
      "An admin login for RouterOS",
      "Cable or Wi-Fi to the same LAN as the router",
      "A public hostname is required — otherwise use a local Connector instead",
    ],
    tint: "radial-gradient(circle at 30% 30%, #34d399, #0ea5e9 60%, transparent)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M2 20h20" />
      </svg>
    ),
  },
  {
    eyebrow: "How it works",
    title: "Five guided steps",
    body: "Every step has clear inputs, copy-paste snippets, and inline checks. You can jump back to any completed step at any time.",
    bullets: [
      "1 · Name + API credentials",
      "2 · Open Winbox on the RouterBoard",
      "3 · Run the generated setup script",
      "4 · Register + reachability test",
      "5 · Done — router is live in your fleet",
    ],
    tint: "radial-gradient(circle at 30% 30%, #f472b6, #a855f7 60%, transparent)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    eyebrow: "Ready",
    title: "You're set — let's go",
    body: "If anything fails at Step 4, the failure card offers a one-click soft rollback (removes the API user + cert) or a hard restore from the pre-change backup. If the router simply can't be reached from the internet, use the Connectors tab and pair a local connector instead.",
    tint: "radial-gradient(circle at 30% 30%, #fbbf24, #f97316 60%, transparent)",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12l4 4 10-10" />
      </svg>
    ),
  },
];

function IntroTour({
  slide,
  onNext,
  onBack,
  onStart,
  onSkip,
}: {
  slide: number;
  onNext: () => void;
  onBack: () => void;
  onStart: () => void;
  onSkip: () => void;
}) {
  const s = INTRO_SLIDES[slide] ?? INTRO_SLIDES[0];
  const isLast = slide >= INTRO_SLIDES.length - 1;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick setup tour"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" onClick={onSkip} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-3xl border border-white/20 bg-background/80 p-4 shadow-2xl backdrop-blur-2xl sm:p-6">
        <div
          className="absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-70"
          style={{ background: s.tint, filter: "blur(30px)" }}
          aria-hidden="true"
        />
        <div className="relative flex items-start gap-3 sm:gap-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 text-white shadow-lg sm:h-14 sm:w-14"
            style={{
              background:
                "linear-gradient(140deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.12))",
              backdropFilter: "blur(14px) saturate(160%)",
            }}
          >
            <div className="h-6 w-6 sm:h-7 sm:w-7">{s.icon}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
              {s.eyebrow}
            </div>
            <h2 className="mt-1 text-lg font-semibold sm:text-xl">{s.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            {s.bullets && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 sm:mt-6">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {INTRO_SLIDES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
            {slide > 0 && (
              <button type="button" onClick={onBack} className="btn-ghost min-h-[40px]">
                Back
              </button>
            )}
            {isLast ? (
              <button type="button" onClick={onStart} className="btn-primary min-h-[40px]">
                Start setup
              </button>
            ) : (
              <button type="button" onClick={onNext} className="btn-primary min-h-[40px]">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
