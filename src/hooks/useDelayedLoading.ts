import { useEffect, useState } from "react";

/** Default delay before showing known-shape skeletons (avoids flash on fast loads). */
export const SKELETON_DELAY_MS = 300;

/**
 * Returns true only after `active` has stayed true for `delayMs`.
 * Use for known-shape skeletons when wait is expected to exceed ~300ms.
 */
export function useDelayedLoading(active: boolean, delayMs: number = SKELETON_DELAY_MS): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const id = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);

  return show;
}
