import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { saveConnector } from '@/lib/connectors.functions';
import { detectDesktopOs } from '@/lib/browser/platform';
import { copyText } from '@/lib/browser/clipboard';

type StepId = 1 | 2 | 3;

export function ConnectorWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<StepId>(1);
  const [name, setName] = useState("");
  const [os, setOs] = useState<"windows" | "macos">(() => detectDesktopOs() === "macos" ? "macos" : "windows");
  
  const qc = useQueryClient();
  const save = useServerFn(saveConnector);

  const addMutation = useMutation({
    mutationFn: (n: string) => save({ data: { name: n } }),
    onSuccess: (res) => {
      toast.success("Connector created successfully");
      qc.invalidateQueries({ queryKey: ["connectors"] });
      onDone();
    },
    onError: (e: any) => toast.error(e.message || "Failed to create connector"),
  });

  const steps = [
    { id: 1, label: "Identity", icon: "🆔" },
    { id: 2, label: "Environment", icon: "💻" },
    { id: 3, label: "Finalize", icon: "✨" },
  ];

  return (
    <div className="relative mx-auto max-w-2xl space-y-6 p-4">
      {/* Stepper */}
      <div className="flex items-center justify-between px-4 py-2">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
              step === s.id ? "border-primary bg-primary text-primary-foreground shadow-[0_0_10px_var(--color-primary)]" : 
              step > s.id ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-border text-muted-foreground"
            }`}>
              {step > s.id ? "✓" : s.id}
            </div>
            <span className={`text-xs font-medium ${step === s.id ? "text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <div className={`h-px flex-1 mx-2 ${step > s.id ? "bg-emerald-500/40" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Identity */}
      {step === 1 && (
        <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl transition-all hover:border-primary/30">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative z-10">
            <h2 className="text-xl font-semibold mb-2">Name your Connector</h2>
            <p className="text-sm text-muted-foreground mb-6">Give this connector a friendly name (e.g. "Main Site Bridge") to identify it in your fleet.</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70">Connector Name</span>
                <input
                  className="input w-full min-h-[44px] rounded-xl bg-black/20 border-white/10 focus:border-primary transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Yangon Central Office"
                />
              </div>
              <button 
                onClick={() => setStep(2)} 
                disabled={!name.trim()}
                className="btn-primary w-full min-h-[44px] rounded-xl transition-all disabled:opacity-50"
              >
                Continue to Environment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Environment */}
      {step === 2 && (
        <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl transition-all hover:border-primary/30">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative z-10">
            <h2 className="text-xl font-semibold mb-2">Select Operating System</h2>
            <p className="text-sm text-muted-foreground mb-6">We'll provide the correct installation script based on your host machine's OS.</p>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {(['windows', 'macos'] as const).map(o => (
                <button
                  key={o}
                  onClick={() => setOs(o)}
                  className={`p-4 rounded-2xl border transition-all text-left ${
                    os === o ? "border-primary bg-primary/20 ring-1 ring-primary" : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="text-lg font-semibold capitalize">{o}</div>
                  <div className="text-xs text-muted-foreground opacity-60">
                    {o === 'windows' ? 'PowerShell install' : 'Bash/Curl install'}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn-ghost flex-1 min-h-[44px] rounded-xl">Back</button>
              <button onClick={() => setStep(3)} className="btn-primary flex-1 min-h-[44px] rounded-xl">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Finalize */}
      {step === 3 && (
        <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl transition-all hover:border-primary/30">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative z-10">
            <h2 className="text-xl font-semibold mb-2">Ready to Pair</h2>
            <p className="text-sm text-muted-foreground mb-6">Confirm your settings and create the connector record in the cloud.</p>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                <span className="text-xs text-muted-foreground">Name</span>
                <span className="text-xs font-medium">{name}</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                <span className="text-xs text-muted-foreground">OS</span>
                <span className="text-xs font-medium capitalize">{os}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 min-h-[44px] rounded-xl">Back</button>
              <button 
                onClick={() => addMutation.mutate(name)} 
                disabled={addMutation.isPending}
                className="btn-primary flex-1 min-h-[44px] rounded-xl transition-all disabled:opacity-50"
              >
                {addMutation.isPending ? "Creating..." : "Create Connector"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
