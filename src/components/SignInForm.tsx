import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { setSelectedSite } from "@/hooks/useSelectedSite";
import { resetTenantQueryCache } from "@/lib/auth-query-cache";
import { resolveLoginEmail } from "@/lib/owner.functions";

/**
 * Sign-in form for /auth.
 *
 * The submit control stays disabled until the client has hydrated. Before
 * hydration a click on an enabled submit button performs a *native* GET form
 * submission, which reloads /auth, discards the typed credentials and drops the
 * ?next= parameter — the "sign in does nothing / throws me back" failure.
 */
export function SignInForm({ returnTo }: { returnTo: string }) {
  const resolveEmail = useServerFn(resolveLoginEmail);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [ready, setReady] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  // Read the locally-persisted session (same source the route gate uses) so we
  // never bounce back and forth between /auth and the protected route.
  useEffect(() => {
    let cancelled = false;
    try {
      // Accessing `supabase.auth` can throw synchronously if client env is missing;
      // that must not blank the sign-in page on client navigations.
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!cancelled && data.session) navigate({ to: returnTo, replace: true });
        })
        .catch(() => {
          /* a broken/expired local session must not crash the sign-in page */
        });
    } catch (e) {
      console.error(e);
      setErr(
        e instanceof Error ? e.message : "Sign-in is unavailable. Refresh or contact support.",
      );
    }
    return () => {
      cancelled = true;
    };
  }, [returnTo, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { email: resolved } = await resolveEmail({ data: { identifier } });
      const { error } = await supabase.auth.signInWithPassword({
        email: resolved,
        password,
      });
      if (error) throw error;
      setSelectedSite(null);
      await resetTenantQueryCache(qc);
      navigate({ to: returnTo, replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        required
        autoComplete="username"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        placeholder="Username or email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <input
        type="password"
        required
        minLength={6}
        autoComplete="current-password"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {err && (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {err}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !ready}
        aria-busy={busy}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Please wait…" : "Sign in"}
      </button>
    </form>
  );
}

export default SignInForm;
