import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { consumeIntentionalSignOut } from "@/lib/session-signout";
import { resetTenantQueryCache } from "@/lib/auth-query-cache";
import { classifyForcedSignOut, forcedSignOutMessage } from "@/lib/session-guard";
import {
  clearSessionExpired,
  consumeSessionExpired,
  SESSION_EXPIRED_EVENT,
} from "@/lib/session-events";

/**
 * Handles a session that stopped being valid while the app was open.
 *
 * Distinguishes normal expiry / failed refresh from a remote revoke (e.g.
 * Supabase "Single session per user" after sign-in on another device), so we
 * never show the "another device" toast for a simple session expiry.
 *
 * It only reacts to the auth state; it never revokes anything itself, so it
 * cannot race the newest login.
 */
export function SessionGuard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const handled = useRef(false);
  /** Last known access-token expiry (unix seconds) while a session was present. */
  const lastExpiresAt = useRef<number | null>(null);

  useEffect(() => {
    const redirectToSignIn = () => {
      if (handled.current) return;
      handled.current = true;
      consumeSessionExpired();
      toast.error("Your session expired. Please sign in again.");
      void resetTenantQueryCache(queryClient);
      void supabase.auth.signOut({ scope: "local" }).catch(() => {});
      navigate({ to: "/auth", replace: true });
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, redirectToSignIn);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.expires_at) {
        lastExpiresAt.current = session.expires_at;
        handled.current = false;
        clearSessionExpired();
      }

      if (session) return;
      if (event !== "SIGNED_OUT" && event !== "TOKEN_REFRESHED") return;
      if (handled.current) return;
      // Consume before marking handled: a deliberate sign-out must not disarm
      // the guard for a later forced invalidation in the same runtime.
      if (consumeIntentionalSignOut()) return;
      handled.current = true;

      const reason = classifyForcedSignOut({
        event,
        previousExpiresAt: lastExpiresAt.current,
      });

      void (async () => {
        toast.error(forcedSignOutMessage(reason));
        await resetTenantQueryCache(queryClient);
        navigate({ to: "/auth", replace: true });
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      })();
    });

    // The client middleware may have detected the expiry before this effect
    // subscribed to the DOM event. Check the durable signal immediately.
    if (consumeSessionExpired()) redirectToSignIn();

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, redirectToSignIn);
      data.subscription.unsubscribe();
    };
  }, [navigate, queryClient]);

  return null;
}
