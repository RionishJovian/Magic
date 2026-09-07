/** Animated internal badge for MikroTik Magic Developer (platform_admins only). */
export function DevBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`dev-badge inline-flex shrink-0 items-center gap-1 rounded-full border border-violet-500/50 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-200 ${className}`}
      title="MikroTik Magic Developer (Team Magic internal)"
      aria-label="Developer — MikroTik Magic internal operator"
    >
      <span
        className="dev-badge-dot inline-block h-1.5 w-1.5 rounded-full bg-violet-400"
        aria-hidden
      />
      Developer
    </span>
  );
}
