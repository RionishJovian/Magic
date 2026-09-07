import React from 'react';

export function PortalDemo() {
  return (
    <div className="relative group mx-auto max-w-[320px] perspective-1000">
      {/* Phone Frame */}
      <div className="relative z-10 mx-auto h-[640px] w-[320px] overflow-hidden rounded-[3rem] border-[8px] border-white/20 bg-black shadow-2xl ring-1 ring-white/30 transition-transform duration-700 group-hover:rotate-y-6 group-hover:scale-105">
        {/* Top Notch/Camera */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-6 w-24 rounded-b-2xl bg-black z-20" />
        
        {/* Video Loop Container */}
        <div className="relative h-full w-full overflow-hidden">
          <video 
            autoPlay 
            muted 
            loop 
            playsInline
            className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
            poster="/assets/portal-placeholder.jpg"
          >
            <source src="/assets/demos/portal-loop.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
          
          {/* Luxury Glass Overlay */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/10 via-transparent to-white/5" />
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-1/2 -left-1/2 h-full w-full rotate-45 bg-gradient-to-r from-transparent via-white/10 to-transparent blur-xl animate-sweep" />
          </div>
        </div>
      </div>

      {/* Ambient Glow behind phone */}
      <div className="absolute -inset-4 rounded-[4rem] bg-primary/20 blur-3xl transition-all group-hover:bg-primary/40" />
      
      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .rotate-y-6 { transform: rotateY(-6deg); }
        @keyframes sweep {
          0% { transform: translateX(-100%) translateY(-100%); }
          100% { transform: translateX(100%) translateY(100%); }
        }
        .animate-sweep {
          animation: sweep 6s infinite linear;
        }
      `}</style>
    </div>
  );
}
