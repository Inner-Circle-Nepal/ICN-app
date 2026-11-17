import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { normalizeQuery, searchReaders } from "@/lib/api/readerSearch";
import type { ReaderProfile } from "@/lib/api/readerProfile";

/**
 * Readers matching what is being typed, for the People tab and the @handle
 * dropdowns.
 *
 * Waits for a short pause in typing, cancels a request the reader has typed
 * past, and keeps the last results on screen while the next ones load so the
 * list does not flash empty between keystrokes.
 */

const DEBOUNCE_MS = 200;

export function useUserSearch(raw: string, { limit = 8 }: { limit?: number } = {}) {
  const typed = normalizeQuery(raw);
  const [term, setTerm] = useState(typed);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(typed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const query = useQuery<ReaderProfile[]>({
    queryKey: ["readerSearch", term, limit],
    queryFn: ({ signal }) => searchReaders(term, { limit, signal }),
    enabled: term.length > 0,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Cleared input hides results at once rather than after the pause.
  const active = typed.length > 0 && term.length > 0;

  return {
    /** What was last searched for. */
    term,
    results: active ? (query.data ?? []) : [],
    /** Typing has outrun the results on screen. */
    searching: typed.length > 0 && (typed !== term || query.isFetching),
    isError: active && query.isError,
    refetch: query.refetch,
  };
}
