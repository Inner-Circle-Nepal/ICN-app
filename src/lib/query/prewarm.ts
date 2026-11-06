import type { QueryClient } from "@tanstack/react-query";

import { getCategories, getTags } from "@/lib/api/queries";
import { getForexRates } from "@/lib/api/forex";
import { getNepseSnapshot } from "@/lib/api/nepse";

/**
 * Warm the handful of queries that every tab will ask for.
 *
 * Each secondary tab (Explore, Chautari, Settings) mounts fresh when the
 * reader switches to it and runs its `useQuery` calls on arrival. Without
 * anything pre-cached that means a visible 300–800 ms lag per switch while
 * the queries resolve. Prefetching these four at boot — alongside the home
 * feed — turns the common case into "already cached, render immediately."
 *
 * Fire-and-forget: the individual `prefetchQuery` calls settle in the
 * background; failures are silent and the hooks themselves surface any
 * error later on the screens that actually read them.
 *
 * Staleness settings here mirror the hooks' own `staleTime`, so a cached
 * entry put here is considered fresh for the same window and won't be
 * re-fetched by the tab screen on mount.
 */
export function prewarmSharedQueries(qc: QueryClient): void {
  void qc.prefetchQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 5 * 60 * 1000,
  });
  void qc.prefetchQuery({
    queryKey: ["tags"],
    queryFn: getTags,
    staleTime: 10 * 60 * 1000,
  });
  void qc.prefetchQuery({
    queryKey: ["forex-rates"],
    queryFn: getForexRates,
    staleTime: 15 * 60 * 1000,
  });
  void qc.prefetchQuery({
    queryKey: ["nepse-snapshot"],
    queryFn: getNepseSnapshot,
    staleTime: 60 * 1000,
  });
}
