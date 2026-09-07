import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compatibility route for saved bookmarks and existing shared links.
 * The Reseller Operation page now has the canonical URL.
 */
export const Route = createFileRoute("/_authenticated/app/owner-operations")({
  beforeLoad: () => {
    throw redirect({ to: "/app/reseller-operation", replace: true });
  },
});
