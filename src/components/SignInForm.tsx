import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { setSelectedSite } from "@/hooks/useSelectedSite";
import { resetTenantQueryCache } from "@/lib/auth-query-cache";
import { resolveLoginEmail } from "@/lib/owner.functions";
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";
import { createTrialAccount } from "@/lib/trial-signup.functions";

type AuthMode = "signin" | "trial";

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
  const createTrial = useServerFn(createTrialAccount);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [identifier, setIdentifier] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
    try {
      if (mode === "trial") {
        const username = identifier.trim().toLowerCase();
        if (!isValidPassword(password)) throw new Error(PASSWORD_POLICY_MESSAGE);
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        await createTrial({
          data: { username, password, display_name: displayName.trim() },
        });
        const { email } = await resolveEmail({ data: { identifier: username } });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setSelectedSite(null);
        await resetTenantQueryCache(qc);
        navigate({ to: returnTo, replace: true });
        return;
      }
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
      <div
        className="grid grid-cols-2 rounded-lg border border-border bg-surface-muted p-1"
        role="tablist"
        aria-label="Account access"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          onClick={() => {
            setMode("signin");
            setErr(null);
            setNotice(null);
          }}
          className={`rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "signin" ? "bg-primary text-primary-foreground shadow-sm" : "text-sub"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "trial"}
          onClick={() => {
            setMode("trial");
            setErr(null);
            setNotice(null);
          }}
          className={`rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "trial" ? "bg-primary text-primary-foreground shadow-sm" : "text-sub"
          }`}
        >
          Start free trial
        </button>
      </div>
      {mode === "trial" && (
        <>
          <p className="text-sub text-xs leading-relaxed">
            Create an isolated MikroMagic workspace with full access for 7 days. No payment card
            is required.
          </p>
          <input
            required
            autoComplete="name"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            placeholder="Your name or business name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </>
      )}
      <input
        required
        type="text"
        autoComplete="username"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        placeholder={mode === "trial" ? "Choose a username" : "Username or email"}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <input
        type="password"
        required
        minLength={6}
        autoComplete={mode === "trial" ? "new-password" : "current-password"}
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {mode === "trial" && (
        <>
          <p className="text-sub text-xs">{PASSWORD_POLICY_MESSAGE}</p>
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </>
      )}
      {err && (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {err}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success"
        >
          {notice}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !ready}
        aria-busy={busy}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Please wait…" : mode === "trial" ? "Create trial account" : "Sign in"}
      </button>
    </form>
  );
}

export default SignInForm;
