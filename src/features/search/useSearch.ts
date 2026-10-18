import { useQuery } from "@tanstack/react-query";
import { getArticlesByTag, getTags, searchArticles } from "@/lib/api/queries";

export function useSearchArticles(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search-articles", trimmed],
    queryFn: ({ signal }) => searchArticles(trimmed, 30, signal),
    enabled: trimmed.length >= 2,
    staleTime: 60 * 1000,
    // A search that fails is better reported than retried three times while
    // the reader is still typing.
    retry: 1,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: getTags,
    staleTime: 10 * 60 * 1000,
  });
}

export function useTagArticles(tagSlug: string | null) {
  return useQuery({
    queryKey: ["tag-articles", tagSlug],
    queryFn: () => (tagSlug ? getArticlesByTag(tagSlug, 16) : Promise.resolve([])),
    enabled: Boolean(tagSlug),
  });
}
