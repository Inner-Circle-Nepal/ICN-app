import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  countArticlesByCategory,
  getArticlesByCategory,
  getCategories,
  getCategoryBySlug,
} from "@/lib/api/queries";
import { PAGE_SIZE } from "@/constants/config";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategoryBySlug(slug: string) {
  return useQuery({
    queryKey: ["category", slug],
    queryFn: () => getCategoryBySlug(slug),
    enabled: Boolean(slug),
  });
}

export function useCategoryCount(slug: string) {
  return useQuery({
    queryKey: ["category-count", slug],
    queryFn: () => countArticlesByCategory(slug),
    enabled: Boolean(slug),
  });
}

export function useInfiniteCategoryArticles(slug: string, pageSize = PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: ["category-articles", slug, pageSize],
    initialPageParam: 0,
    enabled: Boolean(slug),
    queryFn: ({ pageParam }) => getArticlesByCategory(slug, pageSize, pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < pageSize) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
  });
}
