import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Article, ArticleCard, BookmarkRecord } from "@/types/domain";

/**
 * Persistent local bookmarks.
 *
 * Mirrors `icn-saved` in `site/src/components/news/ShareBar.tsx` while storing
 * a compact `BookmarkRecord` summary (never the full HTML article body) so the
 * Saved screen renders immediately on launch without waiting on the network.
 */

const BOOKMARKS_KEY = "icn-saved-bookmarks-v1";

export function toBookmarkRecord(article: ArticleCard | Article): BookmarkRecord {
  return {
    slug: article.slug,
    savedAt: new Date().toISOString(),
    title: article.title,
    title_ne: article.title_ne ?? null,
    excerpt: article.excerpt,
    hero_image: article.hero_image ?? null,
    categorySlug: article.category.slug,
    categoryName: article.category.name,
    authorName: article.author?.name ?? null,
    published_at: article.published_at,
    reading_minutes: article.reading_minutes,
  };
}

export function bookmarkToArticleCard(record: BookmarkRecord): ArticleCard {
  return {
    id: record.slug,
    slug: record.slug,
    title: record.title,
    title_ne: record.title_ne,
    excerpt: record.excerpt,
    excerpt_ne: null,
    hero_image: record.hero_image,
    hero_alt: record.title,
    hero_credit: null,
    category: {
      id: record.categorySlug,
      slug: record.categorySlug,
      name: record.categoryName,
      name_ne: null,
      description: null,
      accent: null,
      sort_order: 0,
    },
    author: record.authorName
      ? {
          id: record.authorName,
          slug: record.authorName.toLowerCase().replace(/\s+/g, "-"),
          name: record.authorName,
          role: null,
          bio: null,
          avatar_url: null,
          location: null,
          email: null,
          x_handle: null,
          linkedin_url: null,
        }
      : null,
    tags: [],
    editions: [],
    status: "published",
    published_at: record.published_at,
    updated_at: null,
    is_featured: false,
    is_breaking: false,
    is_live: false,
    reading_minutes: record.reading_minutes || 1,
    view_count: 0,
    seo_title: null,
    seo_description: null,
  };
}

export async function loadBookmarks(): Promise<BookmarkRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is BookmarkRecord =>
        Boolean(b && typeof b.slug === "string" && typeof b.title === "string"),
    );
  } catch {
    return [];
  }
}

export async function saveBookmarks(records: BookmarkRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage write failure
  }
}
