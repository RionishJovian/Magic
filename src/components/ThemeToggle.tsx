import { Moon, Sun, Monitor } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { Switch } from "@/components/ui/switch-button";
import { pressScaleMobile, springSnappy } from "@/lib/motion-presets";
import { cn } from "@/lib/utils";

const OPTIONS: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

const THEME_PILL_ID = "mm-theme-pref-pill";

/** Compact header control — circular tap on mobile, animated pill switch on desktop. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const reduceMotion = useReducedMotion();
  const isDark = resolved === "dark";
  const ariaLabel = isDark ? "Switch to light mode" : "Switch to dark mode";
  const title = isDark ? "Light mode" : "Dark mode";

  return (
    <>
      <motion.button
        type="button"
        aria-label={ariaLabel}
        title={title}
        onClick={toggle}
        whileTap={reduceMotion ? undefined : { scale: pressScaleMobile }}
        transition={springSnappy}
        className={cn(
          "touch-icon relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] transition-colors hover:border-primary/50 hover:text-primary md:hidden",
          className,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "moon" : "sun"}
            initial={reduceMotion ? false : { opacity: 0, rotate: isDark ? -40 : 40, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, rotate: isDark ? 40 : -40, scale: 0.8 }}
            transition={springSnappy}
            className="flex items-center justify-center"
          >
            {isDark ? (
              <Moon className="h-4 w-4" aria-hidden />
            ) : (
              <Sun className="h-4 w-4" aria-hidden />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      <Switch
        value={isDark}
        onToggle={toggle}
        iconOn={<Moon className="size-4" aria-hidden />}
        iconOff={<Sun className="size-4" aria-hidden />}
        aria-label={ariaLabel}
        title={title}
        className={cn("hidden h-7 shrink-0 md:flex", className)}
      />
    </>
  );
}

/** Profile / settings / More-sheet segmented control for light · dark · system. */
export function ThemePreferencePicker() {
  const { preference, setPreference } = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex gap-1 rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] p-1"
    >
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const selected = preference === id;
        return (
          <motion.button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreference(id)}
            whileTap={reduceMotion ? undefined : { scale: pressScaleMobile }}
            transition={springSnappy}
            className={cn(
              "relative inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
              selected ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {selected && (
              <motion.span
                layoutId={reduceMotion ? undefined : THEME_PILL_ID}
                className="absolute inset-0 rounded-full bg-primary/20 shadow-[0_0_18px_-6px_var(--color-primary)]"
                transition={springSnappy}
                aria-hidden
              />
            )}
            <Icon className="relative z-10 h-3.5 w-3.5" aria-hidden />
            <span className="relative z-10">{label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
