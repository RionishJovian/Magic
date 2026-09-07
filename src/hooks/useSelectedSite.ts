import { useEffect, useState, useCallback } from "react";

const KEY = "mm.selectedSite";
const EVENT = "mm-selected-site-change";

export type SelectedSite = { id: string; name: string } | null;

function read(): SelectedSite {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SelectedSite;
  } catch {
    return null;
  }
}

export function setSelectedSite(s: SelectedSite) {
  if (typeof window === "undefined") return;
  try {
    if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode / quota */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useSelectedSite() {
  const [site, setSite] = useState<SelectedSite>(null);
  useEffect(() => {
    setSite(read());
    const sync = () => setSite(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const clear = useCallback(() => setSelectedSite(null), []);
  return { site, clear };
}
