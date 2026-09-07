import React from 'react';
import { toast } from 'sonner';

interface SovereignUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLimit: string;
}

export function SovereignUpgradeModal({ isOpen, onClose, currentLimit }: SovereignUpgradeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Backdrop - Deep, dark, blurred luxury */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md" 
        onClick={onClose} 
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-b from-white/10 to-white/5 p-1 shadow-2xl animate-in zoom-in-95 duration-300">
        {/* Gold Accent Header */}
        <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-amber-400 via-yellow-600 to-amber-700">
          <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] " />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold tracking-tighter text-white drop-shadow-lg">THE SOVEREIGN</span>
          </div>
          {/* Light streak animation */}
          <div className="absolute inset-0 animate-sweep bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 w-1/2" />
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <h2 className="text-2xl font-semibold text-white mb-3">Your Power has Expanded</h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-8">
            You have reached the natural limits of <span className="text-amber-400 font-medium">The Spark</span>. 
            To continue scaling your network and unlock the full potential of the Magic Hub, 
            it is time to ascend.
          </p>

          {/* Comparison Card */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Current: The Spark</div>
              <div className="text-lg font-medium text-white">{currentLimit}</div>
            </div>
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 ring-1 ring-amber-500/30">
              <div className="text-[10px] uppercase tracking-widest text-amber-400 mb-1">Ascend to Sovereign</div>
              <div className="text-lg font-bold text-white">Unlimited</div>
            </div>
          </div>

          {/* Feature List */}
          <ul className="text-left space-y-3 mb-8 text-xs text-muted-foreground">
            <li className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Unlimited Router Connections
            </li>
            <li className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Proactive AI Health Notifications
            </li>
            <li className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Priority Support & Infrastructure
            </li>
          </ul>

          {/* CTA */}
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => {
                toast.info("Ascension process initiating...");
                // Integration with payment gateway goes here
              }}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 text-white font-bold shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:scale-[1.02] transition-transform active:scale-95"
            >
              Ascend Now
            </button>
            <button 
              onClick={onClose}
              className="w-full py-3 text-xs text-muted-foreground hover:text-white transition-colors"
            >
              I will remain a Spark for now
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-sweep {
          animation: sweep 3s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}
