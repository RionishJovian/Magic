/**
 * Cross-browser Web Storage access.
 *
 * Safari private mode, Firefox Strict Tracking Protection, and some embedded
 * WebViews expose localStorage/sessionStorage but throw on write (quota or
 * security). Probe first; fall back to an in-memory store so a session still
 * works even when disk persistence is blocked.
 */

export function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value));
    },
  };
}

function probe(store: Storage): boolean {
  try {
    const key = "__mm_storage_probe__";
    store.setItem(key, "1");
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function pickStore(candidate: Storage | undefined): Storage {
  if (candidate && probe(candidate)) return candidate;
  return createMemoryStorage();
}

export function getSafeLocalStorage(): Storage {
  if (typeof window === "undefined") return createMemoryStorage();
  try {
    return pickStore(window.localStorage);
  } catch {
    return createMemoryStorage();
  }
}

export function getSafeSessionStorage(): Storage {
  if (typeof window === "undefined") return createMemoryStorage();
  try {
    return pickStore(window.sessionStorage);
  } catch {
    return createMemoryStorage();
  }
}
