/**
 * Browser-safe public config.
 *
 * Lovable/Cloudflare keep SUPABASE_* as runtime Worker secrets. Vite cannot
 * inline those into the client bundle at build time, so SSR writes them onto
 * `window.__MM_PUBLIC__` (publishable key only — never the service role).
 */

export type PublicSupabaseEnv = {
  url: string;
  publishableKey: string;
};

export type PublicEnv = {
  supabase?: PublicSupabaseEnv;
};

declare global {
  interface Window {
    __MM_PUBLIC__?: PublicEnv;
  }
}

function fromProcess(): PublicSupabaseEnv | null {
  const url =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
    process.env["VITE_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    "";
  const publishableKey =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    "";
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

/** Read public Supabase config (window boot → Vite/process env). */
export function readPublicSupabaseEnv(): PublicSupabaseEnv | null {
  if (typeof window !== "undefined") {
    const fromWindow = window.__MM_PUBLIC__?.supabase;
    if (fromWindow?.url && fromWindow?.publishableKey) return fromWindow;
  }
  return fromProcess();
}

/** Inline boot script for RootShell — safe for `<script>` text content. */
export function publicEnvBootScript(): string {
  const supabase = fromProcess();
  const payload: PublicEnv = supabase ? { supabase } : {};
  // Prevent `</script>` breakouts if a value ever contained that sequence.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  // Merge so a client re-render with empty Vite env cannot wipe SSR values.
  return `window.__MM_PUBLIC__=Object.assign(window.__MM_PUBLIC__||{},${json});`;
}
