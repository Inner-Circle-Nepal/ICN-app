import type { QueryClient } from "@tanstack/react-query";

import { getArticleBySlug } from "@/lib/api/queries";

/**
 * Warm the article-detail cache ahead of navigation.
 *
 * Called from the home / section / search cards when a reader taps a story.
 * React Query's `prefetchQuery` fires the request immediately and resolves it
 * into the cache; by the time `useArticleDetail(slug)` runs on the next
 * screen, the data is already available and the detail renders without the
 * loading skeleton.
 *
 * Fire-and-forget: errors here are irrelevant because the destination screen
 * runs the same query and surfaces its own error state. The void keeps the
 * call site free of a floating-promise lint warning.
 */
export function prefetchArticle(qc: QueryClient, slug: string): void {
  void qc.prefetchQuery({
    queryKey: ["article", slug],
    queryFn: () => getArticleBySlug(slug),
    /*
     * A 5-minute staleness aligns with how long a reader typically spends
     * between opening the feed and tapping a story. Anything fresher is
     * wasted work; anything older is likely to be re-fetched on arrival
     * anyway.
     */
    staleTime: 5 * 60 * 1000,
  });
}
