import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getArticleBySlug,
  getArticlesByEdition,
  getHomeFeed,
  getLatestArticles,
  getRelatedArticles,
  recordArticleView,
} from "@/lib/api/queries";
import { PAGE_SIZE } from "@/constants/config";

export function useHomeFeed() {
  return useQuery({
    queryKey: ["home-feed"],
    queryFn: getHomeFeed,
  });
}

export function useInfiniteLatestArticles(pageSize = PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: ["latest-articles", pageSize],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getLatestArticles(pageSize, pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < pageSize) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
  });
}

export function useArticleDetail(slug: string) {
  const articleQuery = useQuery({
    queryKey: ["article", slug],
    queryFn: () => getArticleBySlug(slug),
    enabled: Boolean(slug),
  });

  const article = articleQuery.data ?? null;

  /*
   * Related stories are chosen from the article's own category and tags, so
   * those belong in the key. Keyed on the slug alone, a story that was
   * recategorised kept serving the old cached neighbours.
   */
  const relatedQuery = useQuery({
    queryKey: [
      "related-articles",
      slug,
      article?.category.slug,
      article?.tags.map((t) => t.slug).join(","),
    ],
    queryFn: () => (article ? getRelatedArticles(article, 4) : Promise.resolve([])),
    enabled: Boolean(article),
  });

  const viewedSlug = useRef<string | null>(null);
  useEffect(() => {
    const seen = articleQuery.data?.slug;
    // One count per story per mount, not one per background refetch.
    if (seen && viewedSlug.current !== seen) {
      viewedSlug.current = seen;
      void recordArticleView(seen);
    }
  }, [articleQuery.data?.slug]);

  return {
    article,
    related: relatedQuery.data ?? [],
    isLoading: articleQuery.isLoading,
    isFetching: articleQuery.isFetching,
    isError: articleQuery.isError,
    error: articleQuery.error,
    refetch: articleQuery.refetch,
    dataUpdatedAt: articleQuery.dataUpdatedAt,
  };
}

export function useEditionArticles(editionSlug: string, limit = 6) {
  return useQuery({
    queryKey: ["edition-articles", editionSlug, limit],
    queryFn: () => getArticlesByEdition(editionSlug, limit),
    enabled: Boolean(editionSlug),
  });
}
