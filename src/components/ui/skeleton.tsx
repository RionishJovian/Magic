import * as React from "react";
import { cn } from "@/lib/utils";
import { useDelayedLoading, SKELETON_DELAY_MS } from "@/hooks/useDelayedLoading";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton-shimmer rounded-md", className)} aria-hidden {...props} />;
}

/** Generic block for known shapes (avatars, media, tiles). */
function SkeletonShape({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Skeleton className={cn("h-24 w-full rounded-xl", className)} {...props} />;
}

/** Paragraph / body content lines. */
function SkeletonContent({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3 rounded-full", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Card chrome with title + body. */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("glass-panel space-y-4 rounded-2xl p-5", className)} aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/2 rounded-full" />
          <Skeleton className="h-3 w-1/3 rounded-full" />
        </div>
      </div>
      <SkeletonShape className="h-28" />
      <SkeletonContent lines={2} />
    </div>
  );
}

/** Stack of list rows. */
function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <ul className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] p-3"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5 rounded-full" />
            <Skeleton className="h-3 w-3/5 rounded-full" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

/** Article / long-form layout. */
function SkeletonArticle({ className }: { className?: string }) {
  return (
    <article className={cn("glass-panel space-y-5 rounded-2xl p-5 sm:p-6", className)} aria-hidden>
      <Skeleton className="h-4 w-24 rounded-full" />
      <Skeleton className="h-7 w-4/5 max-w-md rounded-lg" />
      <SkeletonShape className="h-40 sm:h-48" />
      <SkeletonContent lines={4} />
      <SkeletonContent lines={3} />
    </article>
  );
}

type SkeletonGateProps = {
  /** True while the known-shape load is in progress. */
  loading: boolean;
  /** Shown after {@link SKELETON_DELAY_MS} (default 300). */
  fallback: React.ReactNode;
  children: React.ReactNode;
  delayMs?: number;
  /** Accessible label announced while the delayed skeleton is visible. */
  label?: string;
  className?: string;
};

/**
 * Renders children when not loading. When loading, waits `delayMs` then shows
 * the known-shape skeleton fallback (avoids flicker on sub-300ms responses).
 */
function SkeletonGate({
  loading,
  fallback,
  children,
  delayMs = SKELETON_DELAY_MS,
  label = "Loading",
  className,
}: SkeletonGateProps) {
  const showSkeleton = useDelayedLoading(loading, delayMs);

  if (!loading) return <>{children}</>;
  if (!showSkeleton) {
    return <div className={cn("min-h-[1.5rem]", className)} aria-busy="true" aria-live="polite" />;
  }

  return (
    <div className={className} role="status" aria-busy="true" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      {fallback}
    </div>
  );
}

type DelayedFallbackProps = {
  loading: boolean;
  fallback: React.ReactNode;
  delayMs?: number;
  label?: string;
  className?: string;
};

/** Drop-in for `if (loading) return …` — only paints after the delay. */
function DelayedFallback({
  loading,
  fallback,
  delayMs = SKELETON_DELAY_MS,
  label = "Loading",
  className,
}: DelayedFallbackProps) {
  return (
    <SkeletonGate
      loading={loading}
      fallback={fallback}
      delayMs={delayMs}
      label={label}
      className={className}
    >
      {null}
    </SkeletonGate>
  );
}

export {
  Skeleton,
  SkeletonShape,
  SkeletonContent,
  SkeletonCard,
  SkeletonList,
  SkeletonArticle,
  SkeletonGate,
  DelayedFallback,
};
