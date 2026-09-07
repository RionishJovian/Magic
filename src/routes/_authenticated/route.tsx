import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Use the locally persisted session for normal checks so a slow
    // /auth/v1/user call cannot cause a redirect loop. When the token is
    // expired or nearly expired, validate it with one refresh before entering
    // the protected route.
    const { data } = await supabase.auth.getSession();
    let session = data.session;
    const expiresSoon =
      session?.expires_at != null && session.expires_at <= Math.floor(Date.now() / 1000) + 60;

    if (session && expiresSoon) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.error || !refreshed.data.session ? null : refreshed.data.session;
      if (!session) await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }

    if (!session) {
      throw redirect({ to: "/auth", search: { next: location.href }, replace: true });
    }
    return { user: session.user };
  },
  component: () => <Outlet />,
});
