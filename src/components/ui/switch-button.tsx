import { motion, AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { springSnappy } from "@/lib/motion-presets";

type SwitchProps = {
  value: boolean;
  onToggle: () => void;
  iconOn: ReactNode;
  iconOff: ReactNode;
  className?: string;
  "aria-label"?: string;
  title?: string;
};

export function Switch({
  value,
  onToggle,
  iconOn,
  iconOff,
  className = "",
  "aria-label": ariaLabel,
  title,
}: SwitchProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      className={`bg-card-foreground/15 flex w-12 cursor-pointer rounded-full p-0.5 ${
        value ? "justify-end" : "justify-start"
      } ${className}`}
      onClick={onToggle}
    >
      <motion.div
        className="flex size-6 items-center justify-center rounded-full bg-background"
        layout
        transition={springSnappy}
      >
        <AnimatePresence mode="wait" initial={false}>
          {value ? (
            <motion.div
              key="on"
              initial={{ opacity: 0, rotate: -60 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 60 }}
              transition={springSnappy}
              className="flex size-5 items-center justify-center"
            >
              {iconOn}
            </motion.div>
          ) : (
            <motion.div
              key="off"
              initial={{ opacity: 0, rotate: 60 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -60 }}
              transition={springSnappy}
              className="flex size-5 items-center justify-center"
            >
              {iconOff}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </button>
  );
}
