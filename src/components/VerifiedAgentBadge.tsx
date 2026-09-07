/** Status badge for MikroMagic Agent accounts — shown on Users, shell, and Profile. */
export function VerifiedAgentBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`agent-badge inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200 ${className}`}
      title="Verified MikroMagic Agent"
      aria-label="Verified Agent"
    >
      <span
        className="agent-badge-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
        aria-hidden
      />
      Verified Agent
    </span>
  );
}
