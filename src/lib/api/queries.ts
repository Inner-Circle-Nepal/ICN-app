import type {
  Article,
  ArticleCard,
  Author,
  Category,
  HomeFeedData,
  Tag,
} from "@/types/domain";
import {
  CARD_COLUMNS,
  FULL_COLUMNS,
  FULL_COLUMNS_NE,
} from "@/constants/config";
import { getPublicSupabase } from "./supabase";
import { getForexRates } from "./forex";
import { getNepseIndex } from "./nepse";

/**
 * Typed data read layer for Inner Circle Nepal Mobile.
 *
 * Mirrors `site/src/lib/data/queries.ts` one-for-one against the live
 * Supabase PostgREST schema, including graceful column-migration fallbacks
 * (`42703 undefined_column`) for `is_locked`, `body_ne`, and `search_vector_ne`.
 */

type TagRef = { id: string; slug: string; name: string };
type RawRow = Record<string, unknown> & {
  tags?: ({ tag: TagRef | TagRef[] | null } | null)[] | null;
  category?: unknown;
  author?: unknown;
};

function one<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

export function normaliseArticleRow<T extends Article | ArticleCard>(row: RawRow): T {
  const tags: TagRef[] = (row.tags ?? []).flatMap((entry) => {
    const t = entry?.tag;
    if (!t) return [];
    return Array.isArray(t) ? t : [t];
  });

  return {
    ...row,
    tags,
    category: one<Category>(row.category),
    author: one<Author>(row.author),
    editions: Array.isArray(row.editions) ? (row.editions as string[]) : [],
    reading_minutes: Number(row.reading_minutes ?? 1) || 1,
    view_count: Number(row.view_count ?? 0) || 0,
    body_ne: (row.body_ne as string | null) ?? null,
  } as unknown as T;
}

function usable<T extends { category: Category | null }>(
  rows: T[],
): (T & { category: Category })[] {
  return rows.filter((r): r is T & { category: Category } => Boolean(r?.category));
}

const NOW = () => new Date().toISOString();
const UNDEFINED_COLUMN = "42703";
const CATEGORY_BASE = "id, slug, name, name_ne, description, accent, sort_order";

/**
 * Escapes the wildcards `LIKE` understands so a reader's query is matched
 * literally. Without it a search for "50%" means "50 followed by anything"
 * and quietly returns stories that have nothing to do with the query.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/* -------------------------------------------------------------------------- */
/*  Categories, Tags & Authors                                                 */
/* -------------------------------------------------------------------------- */

export async function getCategories(): Promise<Category[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data, error } = await sb
    .from("categories")
    .select(`${CATEGORY_BASE}, is_locked, locked_blurb`)
    .order("sort_order");

  if (!error && data) return data as Category[];

  if (error && error.code !== UNDEFINED_COLUMN) {
    throw new Error(error.message);
  }

  const { data: base, error: baseError } = await sb
    .from("categories")
    .select(CATEGORY_BASE)
    .order("sort_order");

  if (baseError) throw new Error(baseError.message);
  if (!base) return [];
  return base.map((c) => ({ ...c, is_locked: false, locked_blurb: null })) as Category[];
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const all = await getCategories();
  return all.find((c) => c.slug === slug) ?? null;
}

export async function getTags(): Promise<Tag[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data, error } = await sb.from("tags").select("id, slug, name").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Tag[];
}

export async function getAuthors(): Promise<Author[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data, error } = await sb.from("authors").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Author[];
}

/* -------------------------------------------------------------------------- */
/*  Article Lists                                                              */
/* -------------------------------------------------------------------------- */

function publishedQuery(sb: NonNullable<ReturnType<typeof getPublicSupabase>>) {
  return sb
    .from("articles")
    .select(CARD_COLUMNS)
    .eq("status", "published")
    .lte("published_at", NOW())
    .order("published_at", { ascending: false });
}

export async function getLatestArticles(limit = 16, offset = 0): Promise<ArticleCard[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data, error } = await publishedQuery(sb).range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  if (!data) return [];
  return usable(data.map((r) => normaliseArticleRow<ArticleCard>(r as unknown as RawRow)));
}

export async function getFeaturedArticles(limit = 5): Promise<ArticleCard[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data, error } = await publishedQuery(sb).eq("is_featured", true).limit(limit);
  if (error) throw new Error(error.message);
  if (!data) return [];
  return usable(data.map((r) => normaliseArticleRow<ArticleCard>(r as unknown as RawRow)));
}

export async function getBreakingArticles(limit = 6): Promise<ArticleCard[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data, error } = await publishedQuery(sb)
    .or("is_breaking.eq.true,is_live.eq.true")
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!data) return [];
  return usable(data.map((r) => normaliseArticleRow<ArticleCard>(r as unknown as RawRow)));
}

export async function getTrendingArticles(limit = 5): Promise<ArticleCard[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data, error } = await sb
    .from("articles")
    .select(CARD_COLUMNS)
    .eq("status", "published")
    .lte("published_at", NOW())
    .order("view_count", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!data) return [];
  return usable(data.map((r) => normaliseArticleRow<ArticleCard>(r as unknown as RawRow)));
}

export async function getArticlesByCategory(
  slug: string,
  limit = 16,
  offset = 0,
): Promise<ArticleCard[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const category = await getCategoryBySlug(slug);
  if (!category) return [];

  const { data, error } = await publishedQuery(sb)
    .eq("category_id", category.id)
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  if (!data) return [];
  return usable(data.map((r) => normaliseArticleRow<ArticleCard>(r as unknown as RawRow)));
}

export async function countArticlesByCategory(slug: string): Promise<number> {
  const sb = getPublicSupabase();
  if (!sb) return 0;

  const category = await getCategoryBySlug(slug);
  if (!category) return 0;

  const { count, error } = await sb
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .lte("published_at", NOW())
    .eq("category_id", category.id);

  if (error) return 0;
  return count ?? 0;
}

export async function getArticlesByEdition(slug: string, limit = 12): Promise<ArticleCard[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const { data, error } = await publishedQuery(sb)
    .contains("editions", [slug])
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!data) return [];
  return usable(data.map((r) => normaliseArticleRow<ArticleCard>(r as unknown as RawRow)));
}

export async function getArticlesByTag(slug: string, limit = 12): Promise<ArticleCard[]> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const allTags = await getTags();
  const tag = allTags.find((t) => t.slug === slug);
  if (!tag) return [];

  const { data: links, error: linkError } = await sb
    .from("article_tags")
    .select("article_id")
    .eq("tag_id", tag.id)
    .limit(500);

  if (linkError || !links?.length) return [];

  const ids = links.map((l) => (l as { article_id: string }).article_id);
  const { data, error } = await publishedQuery(sb).in("id", ids).limit(limit);
  if (error || !data) return [];
  return usable(data.map((r) => normaliseArticleRow<ArticleCard>(r as unknown as RawRow)));
}

/* -------------------------------------------------------------------------- */
/*  Single Article & Related                                                   */
/* -------------------------------------------------------------------------- */

let neBodyMissing = false;

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const query = (columns: string) =>
    sb
      .from("articles")
      .select(columns)
      .eq("slug", slug)
      .eq("status", "published")
      .lte("published_at", NOW())
      .maybeSingle();

  const askedForNe = !neBodyMissing;
  let { data, error } = await query(askedForNe ? FULL_COLUMNS_NE : FULL_COLUMNS);

  if (error?.code === UNDEFINED_COLUMN && askedForNe) {
    neBodyMissing = true;
    ({ data, error } = await query(FULL_COLUMNS));
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const article = normaliseArticleRow<Article>(data as unknown as RawRow);
  if (!article.category) return null;

  return article;
}

/**
 * Increments the article view count via the Postgres SECURITY DEFINER RPC.
 * Fire-and-forget; never blocks rendering.
 */
export async function recordArticleView(slug: string): Promise<void> {
  const sb = getPublicSupabase();
  if (!sb || !slug) return;
  try {
    await sb.rpc("increment_article_views", { article_slug: slug });
  } catch {
    // Non-critical telemetry
  }
}

export async function getRelatedArticles(
  article: Article,
  limit = 4,
): Promise<ArticleCard[]> {
  const picked = new Map<string, ArticleCard>();

  try {
    const sameCategory = await getArticlesByCategory(article.category.slug, limit + 4);
    for (const a of sameCategory) {
      if (a.slug !== article.slug) picked.set(a.slug, a);
    }

    if (picked.size < limit && article.tags.length > 0) {
      for (const t of article.tags) {
        const byTag = await getArticlesByTag(t.slug, limit);
        for (const a of byTag) {
          if (a.slug !== article.slug) picked.set(a.slug, a);
        }
        if (picked.size >= limit + 2) break;
      }
    }
  } catch {
    // Degrade gracefully to whatever was gathered
  }

  return [...picked.values()].slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/*  Search                                                                     */
/* -------------------------------------------------------------------------- */

let neVectorMissing = false;

/**
 * Full-text search across published stories.
 *
 * `signal` is the one TanStack Query hands the query function. Passing it on
 * means a search still in flight is actually cancelled when the reader types
 * the next character, instead of running to completion against a result no
 * screen will ever show — on a slow connection that is several redundant
 * round trips per word typed.
 */
export async function searchArticles(
  query: string,
  limit = 30,
  signal?: AbortSignal,
): Promise<ArticleCard[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const sb = getPublicSupabase();
  if (!sb) throw new Error("Supabase is not configured.");

  const base = () => {
    const builder = sb
      .from("articles")
      .select(CARD_COLUMNS)
      .eq("status", "published")
      .lte("published_at", NOW());
    return signal ? builder.abortSignal(signal) : builder;
  };

  const askedForNe = !neVectorMissing;

  const [english, nepali] = await Promise.all([
    base()
      .textSearch("search_vector", q, { type: "websearch", config: "english" })
      .limit(limit),
    askedForNe
      ? base()
          .textSearch("search_vector_ne", q, { type: "plain", config: "simple" })
          .limit(limit)
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (nepali.error?.code === UNDEFINED_COLUMN && askedForNe) {
    neVectorMissing = true;
  }

  const merged = new Map<string, ArticleCard>();
  for (const result of [english, nepali]) {
    if (result.error || !result.data) continue;
    for (const row of usable(
      (result.data as unknown as RawRow[]).map((r) => normaliseArticleRow<ArticleCard>(r)),
    )) {
      if (!merged.has(row.id)) merged.set(row.id, row);
    }
  }

  if (merged.size > 0) {
    return [...merged.values()].slice(0, limit);
  }

  // Fallback to headline substring match in English and Nepali
  const fallbackQuery = (column: "title" | "title_ne") => {
    const builder = publishedQuery(sb).ilike(column, `%${escapeLikePattern(q)}%`).limit(limit);
    return signal ? builder.abortSignal(signal) : builder;
  };
  const [enFallback, neFallback] = await Promise.all([
    fallbackQuery("title"),
    fallbackQuery("title_ne"),
  ]);

  const fallback = new Map<string, ArticleCard>();
  for (const result of [enFallback, neFallback]) {
    if (!result.data) continue;
    for (const row of usable(
      (result.data as unknown as RawRow[]).map((r) => normaliseArticleRow<ArticleCard>(r)),
    )) {
      if (!fallback.has(row.id)) fallback.set(row.id, row);
    }
  }

  return [...fallback.values()].slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/*  Editorial Homepage Composite Feed                                          */
/* -------------------------------------------------------------------------- */

export async function getHomeFeed(): Promise<HomeFeedData> {
  const [featured, latest, trending, categories, forexRates, nepseReading] =
    await Promise.all([
      getFeaturedArticles(5),
      getLatestArticles(18),
      getTrendingArticles(5),
      getCategories(),
      getForexRates().catch(() => []),
      getNepseIndex().catch(() => ({ index: null, isOpen: false })),
    ]);

  const immigration = await getArticlesByCategory("immigration", 3).catch(() => []);

  const investigationsCategory =
    categories.find((c) => c.slug === "investigations") ?? null;
  const investigationStories =
    investigationsCategory && !investigationsCategory.is_locked
      ? await getArticlesByCategory("investigations", 3).catch(() => [])
      : [];

  // Replicate exact homepage editorial curation logic from `site/src/app/(site)/page.tsx`
  const [firstFeatured, ...restFeatured] = featured;
  const lead = firstFeatured ?? latest[0] ?? null;

  const rail: ArticleCard[] = [...restFeatured];
  for (const a of latest) {
    if (rail.length >= 3) break;
    if (a.slug === lead?.slug || rail.some((r) => r.slug === a.slug)) continue;
    rail.push(a);
  }
  const alsoLeading = rail.slice(0, 3);

  const used = new Set([lead?.slug, ...alsoLeading.map((a) => a.slug)].filter(Boolean));
  const wire = latest.filter((a) => !used.has(a.slug));

  const secondLead = wire.slice(0, 2);
  const railUsed = new Set(investigationStories.map((a) => a.slug));
  const grid = wire
    .slice(2)
    .filter((a) => !railUsed.has(a.slug))
    .slice(0, 8);

  return {
    lead,
    secondLead,
    alsoLeading,
    latestGrid: grid.slice(0, 4),
    latestBriefs: grid.slice(4, 8),
    immigration,
    trending,
    investigationsCategory,
    investigationStories,
    categories,
    forexRates,
    nepseReading,
    fetchedAt: new Date().toISOString(),
  };
}
