/**
 * Shared Motion spring presets — UI chrome only (mobile-first).
 * Do not use these in router / hub / deploy / voucher server paths.
 */
import type { Transition } from "motion/react";

/** Hover, tap, toggles, tab pills — primary mobile feedback */
export const springSnappy: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 25,
};

/** Sheets, drawers, larger layout shifts */
export const springFluid: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 20,
};

/** Desktop / fine pointer */
export const pressScale = 0.98;

/** Mobile thumb press — slightly deeper so taps feel intentional */
export const pressScaleMobile = 0.96;

export const hoverLift = -1;
