import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { saveRouter, testRouter, testConnection } from "@/lib/routers.functions";
import { probeCloudDns, checkPublicReachability, executeQuickSetupRollback } from "@/lib/mikrotik.functions";
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

function QuickSetup() {
  const [step, setStep] = useState<StepId>(1);
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");
  const [apiUser, setApiUser] = useState("");
  const [apiPassword, setApiPassword] = useState("");
  const [ddnsHost, setDdnsHost] = useState("");
  const [savedRouterId, setSavedRouterId] = useState<string | null>(null);
  const [lanIp, setLanIp] = useState("192.168.88.1");
  const [backupTag] = useState(() => `pre-magic-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`);
  const [resumeAvailable, setResumeAvailable] = useState<any>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [introSlide, setIntroSlide] = useState(0);
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      const forced = typeof window !== "undefined" && window.location.search.includes("intro=1");
      const seen = typeof window !== "undefined" && localStorage.getItem("mm.quick-setup.intro.v1") === "1";
      const hasDraft = typeof window !== "undefined" && !!localStorage.getItem("mm.quicksetup.draft.v1");
      if (forced || (!seen && !hasDraft)) setShowIntro(true);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mm.quicksetup.draft.v1");
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && typeof d.step === "number" && d.step > 1) setResumeAvailable(d);
    } catch {}
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) { hydratedRef.current = true; return; }
    if (step === 1 && !name && !identity && !apiUser) return;
    try {
      localStorage.setItem("mm.quicksetup.draft.v1", JSON.stringify({ step, name, identity, apiUser, lanIp, ddnsHost, savedAt: new Date().toISOString() }));
    } catch {}
  }, [step, name, identity, apiUser, lanIp, ddnsHost]);

  const qc = useQueryClient();
  const navigate = useNavigate();
  const save = useServerFn(saveRouter);
  const test = useServerFn(testRouter);
  const probe = useServerFn(probeCloudDns);
  const reachability = useServerFn(checkPublicReachability);
  const runRollback = useServerFn(executeQuickSetupRollback);

  const registerMut = useMutation({
    mutationFn: async () => {
      const host = ddnsHost.trim();
      if (!host) throw new Error("Enter the Cloud DDNS hostname first.");
      const res = await save({
        data: { name, host, port: 443, username: apiUser, password: apiPassword, useTls: true, allowInsecureTls: true, insecureTlsReason: "Quick Setup temporary exception", isDefault: false },
      });
      setSavedRouterId(res.id);
      const t = await test({ data: { id: res.id } });
      if (!t.ok) throw new Error(t.error ?? "Router saved but not reachable");
      await qc.invalidateQueries({ queryKey: ["routers"] });
      return t;
    },
    onSuccess: () => {
      setStep(5);
      localStorage.removeItem("mm.quicksetup.draft.v1");
      toast.success(`Router "${name}" created`);
      setTimeout(() => navigate({ to: "/app/routers" }), 900);
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Quick setup</h1>
        <p className="text-sm text-muted-foreground">Guided wizard to expose RouterOS REST.</p>
      </header>
      {step === 1 && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl">
          <h2 className="text-xl font-semibold mb-4">Step 1 · Credentials</h2>
          <div className="space-y-4">
            <input className="input w-full" placeholder="Router name" value={name} onChange={e => setName(e.target.value)} />
            <input className="input w-full" placeholder="Identity" value={identity} onChange={e => setIdentity(e.target.value)} />
            <input className="input w-full" placeholder="API User" value={apiUser} onChange={e => setApiUser(e.target.value)} />
            <input className="input w-full" type="password" placeholder="API Password" value={apiPassword} onChange={e => setApiPassword(e.target.value)} />
            <button className="btn-primary w-full" onClick={() => setStep(2)} disabled={!name || !identity || !apiUser || !apiPassword}>Continue</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl">
          <h2 className="text-xl font-semibold mb-4">Step 2 · Connectivity</h2>
          <input className="input w-full" placeholder="Cloud DDNS Hostname" value={ddnsHost} onChange={e => setDdnsHost(e.target.value)} />
          <button className="btn-primary w-full mt-4" onClick={() => setStep(4)}>Next</button>
        </div>
      )}
      {step === 4 && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl">
          <h2 className="text-xl font-semibold mb-4">Step 4 · Register</h2>
          <button className="btn-primary w-full" onClick={() => registerMut.mutate()} disabled={registerMut.isPending}>
            {registerMut.isPending ? "Creating..." : "Register Router"}
          </button>
        </div>
      )}
      {step === 5 && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl text-center">
          <h2 className="text-2xl font-bold text-emerald-400 mb-2">✓ Success!</h2>
          <p className="text-muted-foreground">Router {name} is now live in your fleet.</p>
        </div>
      )}
    </div>
  );
}
