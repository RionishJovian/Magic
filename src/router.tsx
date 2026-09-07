import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isUnauthorizedSessionError } from "@/lib/session-events";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Reuse cached data across route changes / component remounts
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // The app has its own polling; window focus refetch is redundant chatter
        refetchOnWindowFocus: false,
        refetchOnReconnect: "always",
        // Retrying an expired session only repeats the unauthorized request
        // while delaying the redirect handled by SessionGuard.
        retry: (failureCount, error) => !isUnauthorizedSessionError(error) && failureCount < 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload on link hover / focus for instant navigation
    defaultPreload: "intent",
    // Allow the preloader to hand back cached data instead of re-fetching
    defaultPreloadStaleTime: 30_000,
    defaultPendingMs: 150,
    defaultPendingMinMs: 0,
  });

  return router;
};
