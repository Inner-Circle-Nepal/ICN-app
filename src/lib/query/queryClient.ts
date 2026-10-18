import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client.
 *
 * `staleTime` is 60 seconds, matching `REVALIDATE = 60` in
 * `site/src/lib/supabase/public.ts`, while `gcTime` retains cached stories
 * in memory for 30 minutes so back-navigation and poor-network transitions
 * stay instantaneous.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 6000),
      refetchOnReconnect: true,
    },
  },
});
