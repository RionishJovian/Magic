import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  CircleDollarSign,
  Ticket,
  Printer,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { PRIMARY_TAB_PATHS, primaryNavItems, type Features, type Roles } from "@/lib/nav/modes";
import { useT } from "@/lib/i18n";
import { pressScaleMobile, springSnappy } from "@/lib/motion-presets";
import { cn } from "@/lib/utils";
import { AppMoreSheet } from "@/components/AppMoreSheet";

const ICONS: Record<(typeof PRIMARY_TAB_PATHS)[number], LucideIcon> = {
  "/app": Home,
  "/app/revenue": CircleDollarSign,
  "/app/vouchers": Ticket,
  "/app/voucher-layouts": Printer,
};

const TAB_PILL_LAYOUT_ID = "mm-app-tab-pill";

function pathMatches(to: string, pathname: string, exact?: boolean) {
  const clean = pathname.replace(/\/+$/, "") || "/app";
  if (exact || to === "/app") return clean === to;
  return clean === to || clean.startsWith(`${to}/`);
}

type Props = {
  roles: Roles;
  features?: Features;
  isPlatformAdmin?: boolean;
  hasActivePlus?: boolean;
  isTrial?: boolean;
  activeMode: import("@/lib/nav/modes").NavMode;
  modes: import("@/lib/nav/modes").NavMode[];
  onChooseMode: (m: import("@/lib/nav/modes").NavMode) => void;
};

/**
 * GitHub-mobile-style iOS tab bar: fixed primary destinations + More sheet
 * for the rest of the mode-based navigation.
 * Motion is cosmetic only — Link targets and More sheet behavior unchanged.
 */
export function AppBottomNav({
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = useMemo(
    () => primaryNavItems(roles, features, isPlatformAdmin, hasActivePlus, isTrial),
    [roles, features, isPlatformAdmin, hasActivePlus, isTrial],
  );
  const [moreOpen, setMoreOpen] = useState(false);

  const onPrimary = tabs.some((t) => pathMatches(t.to, pathname, t.exact));
  const moreActive = moreOpen || !onPrimary;

  return (
    <>
      <nav aria-label="Primary" className="app-tab-bar fixed z-40 md:hidden">
        <div
          className="mx-auto grid max-w-lg px-1 pt-1"
          style={{
            gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))`,
          }}
        >
          {tabs.map((t) => {
            const Icon = ICONS[t.to as (typeof PRIMARY_TAB_PATHS)[number]] ?? Home;
            const active = pathMatches(t.to, pathname, t.exact);
            return (
              <Link
                key={t.to}
                to={t.to}
                preload="intent"
                activeOptions={{ exact: t.exact === true }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 text-[10px] font-medium transition-colors duration-200",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={tr.ui(t.label)}
              >
                <motion.span
                  className="relative flex h-7 w-12 items-center justify-center"
                  whileTap={reduceMotion ? undefined : { scale: pressScaleMobile }}
                  transition={springSnappy}
                >
                  {active && (
                    <motion.span
                      layoutId={reduceMotion ? undefined : TAB_PILL_LAYOUT_ID}
                      className="absolute inset-0 rounded-full bg-primary/15 shadow-[0_0_16px_-4px_var(--color-primary)]"
                      transition={springSnappy}
                      aria-hidden
                    />
                  )}
                  <Icon
                    className={cn(
                      "relative z-10 h-[1.15rem] w-[1.15rem]",
                      active && "stroke-[2.25]",
                    )}
                    aria-hidden
                  />
                </motion.span>
                <span className={cn("max-w-full truncate px-0.5", active && "font-semibold")}>
                  {tr.ui(t.label)}
                </span>
              </Link>
            );
          })}
          <motion.button
            type="button"
            aria-label="More navigation"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
            whileTap={reduceMotion ? undefined : { scale: pressScaleMobile }}
            transition={springSnappy}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 text-[10px] font-medium transition-colors duration-200",
              moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="relative flex h-7 w-12 items-center justify-center">
              {moreActive && (
                <motion.span
                  layoutId={reduceMotion ? undefined : TAB_PILL_LAYOUT_ID}
                  className="absolute inset-0 rounded-full bg-primary/15 shadow-[0_0_16px_-4px_var(--color-primary)]"
                  transition={springSnappy}
                  aria-hidden
                />
              )}
              <MoreHorizontal className="relative z-10 h-[1.15rem] w-[1.15rem]" aria-hidden />
            </span>
            <span className={cn(moreActive ? "font-semibold" : "")}>More</span>
          </motion.button>
        </div>
      </nav>

      <AppMoreSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        roles={roles}
        features={features}
        isPlatformAdmin={isPlatformAdmin}
        hasActivePlus={hasActivePlus}
        isTrial={isTrial}
        activeMode={activeMode}
        modes={modes}
        onChooseMode={onChooseMode}
      />
    </>
  );
}
