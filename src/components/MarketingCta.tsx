/**
 * Marketing-only CTA springs. Do not use on /app ops buttons.
 */
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { hoverLift, pressScaleMobile, springSnappy } from "@/lib/motion-presets";
import { TelegramPlaneIcon } from "@/components/TelegramPlaneIcon";
import { cn } from "@/lib/utils";

type InternalProps = {
  to: "/pricing" | "/auth" | string;
  children: ReactNode;
  className?: string;
  variant?: "glow" | "ghost";
};

/** Public landing / pricing in-app route CTA with spring press. */
export function MarketingCtaLink({ to, children, className, variant = "glow" }: InternalProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className="inline-flex"
      whileHover={reduceMotion ? undefined : { y: hoverLift, scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: pressScaleMobile }}
      transition={springSnappy}
    >
      <Link
        to={to}
        className={cn(variant === "glow" ? "cta-glow animate-glow" : "cta-ghost", className)}
      >
        {children}
      </Link>
    </motion.div>
  );
}

type ExternalProps = {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  /** Loop a decorative plane around the pill border (Telegram CTAs). */
  orbitingPlane?: boolean;
};

/** External marketing CTA (e.g. Telegram) with spring press. */
export function MarketingCtaExternal({
  href,
  children,
  className,
  "aria-label": ariaLabel,
  variant = "glow",
  orbitingPlane = false,
}: ExternalProps & { variant?: "glow" | "plain" }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={ariaLabel}
      className={cn(variant === "glow" && "cta-glow", orbitingPlane && "telegram-cta", className)}
      whileHover={reduceMotion ? undefined : { y: hoverLift, scale: 1.02 }}
      whileTap={reduceMotion ? undefined : { scale: pressScaleMobile }}
      transition={springSnappy}
    >
      {orbitingPlane && !reduceMotion ? (
        <span className="telegram-cta-orbit" aria-hidden>
          <span className="telegram-cta-orbit-arm">
            <TelegramPlaneIcon className="telegram-cta-plane" />
          </span>
        </span>
      ) : null}
      {children}
    </motion.a>
  );
}
