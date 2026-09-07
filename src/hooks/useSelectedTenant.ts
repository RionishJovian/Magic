import { useEffect, useState, useCallback } from "react";

const KEY = "mm.selectedTenant";
const EVENT = "mm-selected-tenant-change";

export type SelectedTenant = {
  id: string;
  label: string;
} | null;

function read(): SelectedTenant {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SelectedTenant;
  } catch {
    return null;
  }
}

export function setSelectedTenant(t: SelectedTenant) {
  if (typeof window === "undefined") return;
  try {
    if (t) window.localStorage.setItem(KEY, JSON.stringify(t));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* private mode / quota */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useSelectedTenant() {
  const [tenant, setTenant] = useState<SelectedTenant>(null);

  useEffect(() => {
    setTenant(read());
    const sync = () => setTenant(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const clear = useCallback(() => setSelectedTenant(null), []);
  return { tenant, clear };
}
