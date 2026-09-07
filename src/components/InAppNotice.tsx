import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { NOTICE_DURATION_MS, NOTICE_ICON, type NoticeTone } from "@/lib/notify/tone";
import { springFluid, springSnappy } from "@/lib/motion-presets";
import { InAppNoticeContext, type InAppNotice } from "./InAppNotice.context";

export function InAppNoticeProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InAppNotice[]>([]);
  const pushNotice = useCallback((n: Omit<InAppNotice, "id"> & { id?: string }) => {
    const id = n.id ?? crypto.randomUUID();
    setItems((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, { ...n, id }]));
  }, []);
  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return (
    <InAppNoticeContext.Provider value={{ pushNotice }}>
      {children}
      <InAppNoticeStack items={items} onRemove={remove} />
    </InAppNoticeContext.Provider>
  );
}

function InAppNoticeStack({
  items,
  onRemove,
}: {
  items: InAppNotice[];
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[80] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-4"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {items.map((n) => (
          <InAppNoticeCard key={n.id} notice={n} onRemove={() => onRemove(n.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function InAppNoticeCard({ notice, onRemove }: { notice: InAppNotice; onRemove: () => void }) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const t = window.setTimeout(onRemove, NOTICE_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [onRemove]);

  const tone = notice.tone;
  const shell =
    tone === "critical"
      ? "notice-surface !border-red-500/60 !text-red-50 !bg-red-900"
      : tone === "caution"
        ? "notice-surface !border-amber-400/60 !text-amber-50 !bg-amber-900"
        : "notice-surface";
  const bodyTone = "opacity-85";

  return (
    <motion.div
      role="status"
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.96, transition: springFluid }
      }
      transition={springSnappy}
      className={`pointer-events-auto w-full max-w-sm rounded-xl p-3 text-sm ${shell}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
          {NOTICE_ICON[tone]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug">{notice.title}</div>
          {notice.body && (
            <p className={`mt-0.5 text-xs leading-relaxed ${bodyTone}`}>{notice.body}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove notification"
          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs opacity-70 transition hover:bg-white/10 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
