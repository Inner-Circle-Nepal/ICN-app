import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, type Query } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";

/**
 * Shared TanStack Query client.
 *
 * `staleTime` is 60 seconds, matching `REVALIDATE = 60` in
 * `site/src/lib/supabase/public.ts`, so anything older is refetched in the
 * background. `gcTime` is a day, which is what lets the persisted front page
 * below survive to the next launch: a cache entry is dropped once it is older
 * than its gcTime, restored or not.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: DAY_MS,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 6000),
      refetchOnReconnect: true,
    },
  },
});

/**
 * The last edition, kept on the device between launches.
 *
 * A cold start used to show placeholders until every request finished; now
 * the previous front page appears at once and is refreshed behind it. Only
 * public, non-personal content is written: the front page, the wire, the
 * reader's edition, categories and markets. Nothing tied to an account (and
 * no Chautari state) is ever persisted.
 */
const PERSISTED_KEYS = new Set([
  "home-feed",
  "latest-articles",
  "edition-articles",
  "categories",
  "forex-rates",
  "nepse-index",
]);

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "icn-query-cache",
  throttleTime: 2000,
});

export const persistOptions = {
  persister: queryPersister,
  maxAge: DAY_MS,
  /* Bump when a persisted response's shape changes, so stale shapes are discarded. */
  buster: "2026-11-no-investigations",
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === "success" && PERSISTED_KEYS.has(String(query.queryKey[0])),
  },
};
