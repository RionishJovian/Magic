import { Link } from "@tanstack/react-router";
import {
  NAV_MODES,
  navItemsForMode,
  type NavMode,
  type Roles,
  type Features,
  PRIMARY_TAB_PATHS,
} from "@/lib/nav/modes";
import { useT } from "@/lib/i18n";
import { useSelectedSite, setSelectedSite } from "@/hooks/useSelectedSite";
import { listSites } from "@/lib/sites.functions";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ThemePreferencePicker } from "@/components/ThemeToggle";
import { pressScaleMobile, springFluid, springSnappy } from "@/lib/motion-presets";
import { cn } from "@/lib/utils";
import { canUseMagicDude } from "@/lib/magic-dude-access";

const PRIMARY = new Set<string>(PRIMARY_TAB_PATHS);
const MODE_PILL_ID = "mm-more-mode-pill";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Roles;
  features?: Features;
  /** Developer (platform_admins) — required so Advanced shows Users/Terminal. */
  isPlatformAdmin?: boolean;
  hasActivePlus?: boolean;
  isTrial?: boolean;
  activeMode: NavMode;
  modes: NavMode[];
  onChooseMode: (m: NavMode) => void;
};

/**
 * Mobile More drawer — same nav/mode/site handlers as before.
 * AnimatePresence only affects open/close chrome (no ops logic).
 */
export function AppMoreSheet({
  open,
  onOpenChange,
  roles,
  features,
  isPlatformAdmin = false,
  hasActivePlus = false,
  isTrial = false,
  activeMode,
  modes,
  onChooseMode,
}: Props) {
  const tr = useT();
  const reduceMotion = useReducedMotion();
  const { site: selectedSite } = useSelectedSite();
  const fetchSites = useServerFn(listSites);
  const sitesQ = useQuery({
    queryKey: ["sites"],
    queryFn: () => fetchSites(),
    enabled: open,
    staleTime: 60_000,
  });

  const items = navItemsForMode(
    roles,
    activeMode,
    features,
    isPlatformAdmin,
    hasActivePlus,
    isTrial,
  ).filter((i) => !PRIMARY.has(i.to));
  const panelTransition = reduceMotion ? { duration: 0.01 } : springFluid;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPortal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <SheetOverlay key="more-overlay" forceMount asChild className="md:hidden">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={panelTransition}
                />
              </SheetOverlay>
              <SheetPrimitive.Content key="more-panel" forceMount asChild>
                <motion.div
                  className={cn(
                    "fixed inset-x-0 bottom-0 z-[90] flex max-h-[85dvh] flex-col gap-0 overflow-y-auto rounded-t-3xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-strong)] p-0 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/45 ring-1 ring-white/10 backdrop-blur-2xl md:hidden",
                  )}
                  initial={reduceMotion ? false : { y: "100%" }}
                  animate={{ y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
                  transition={panelTransition}
                >
                  <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </SheetPrimitive.Close>

                  <div
                    className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/35"
                    aria-hidden
                  />
                  <SheetHeader className="space-y-1 px-5 pb-3 pt-4 text-left">
                    <SheetTitle className="text-base">Navigate</SheetTitle>
                    <SheetDescription className="text-xs">
                      All other tools for this workspace. Primary tabs stay on the bar below.
                    </SheetDescription>
                  </SheetHeader>

                  {modes.length > 1 && (
                    <div
                      role="tablist"
                      aria-label="Navigation mode"
                      className="mx-5 flex gap-1 overflow-x-auto rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                      {NAV_MODES.filter((m) => modes.includes(m.id)).map((m) => {
                        const selected = activeMode === m.id;
                        return (
                          <motion.button
                            key={m.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            title={m.hint}
                            onClick={() => {
                              onChooseMode(m.id);
                              onOpenChange(false);
                            }}
                            whileTap={reduceMotion ? undefined : { scale: pressScaleMobile }}
                            transition={springSnappy}
                            className={cn(
                              "relative min-h-11 min-w-[4.5rem] flex-1 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-semibold transition-colors",
                              selected
                                ? "text-primary"
                                : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
                            )}
                          >
                            {selected && (
                              <motion.span
                                layoutId={reduceMotion ? undefined : MODE_PILL_ID}
                                className="absolute inset-0 rounded-full bg-primary/20 shadow-[0_0_18px_-6px_var(--color-primary)]"
                                transition={springSnappy}
                                aria-hidden
                              />
                            )}
                            <span className="relative z-10">{tr.label(m.label)}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  )}

                  <nav className="grid gap-1 px-3 py-4" aria-label="More destinations">
                    {items.map((t) => (
                      <motion.div
                        key={t.to}
                        whileTap={reduceMotion ? undefined : { scale: pressScaleMobile }}
                        transition={springSnappy}
                      >
                        <Link
                          to={t.to}
                          preload="intent"
                          activeOptions={{ exact: "exact" in t && t.exact === true }}
                          onClick={() => onOpenChange(false)}
                          className="block rounded-xl px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-[color:var(--surface-tint)] hover:text-primary data-[status=active]:bg-primary/15 data-[status=active]:text-primary"
                        >
                          {tr.ui(t.label)}
                          {t.roleLocked && !canUseMagicDude(roles, isPlatformAdmin, isTrial) && (
                            <span className="ml-1 text-[10px] font-semibold tracking-wide text-amber-500">
                              LOCKED
                            </span>
                          )}
                        </Link>
                      </motion.div>
                    ))}
                  </nav>

                  <div className="space-y-3 border-t border-[color:var(--glass-border)] px-5 py-4">
                    <div>
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Appearance
                      </div>
                      <ThemePreferencePicker />
                    </div>
                    {(sitesQ.data?.length ?? 0) > 0 && (
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Site filter
                        <select
                          value={selectedSite?.id ?? ""}
                          onChange={(e) => {
                            const id = e.target.value;
                            if (!id) return setSelectedSite(null);
                            const s = sitesQ.data?.find((x) => x.id === id);
                            if (s) setSelectedSite({ id: s.id, name: s.name });
                          }}
                          className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                        >
                          <option value="">All sites</option>
                          {sitesQ.data?.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </motion.div>
              </SheetPrimitive.Content>
            </>
          ) : null}
        </AnimatePresence>
      </SheetPortal>
    </Sheet>
  );
}
