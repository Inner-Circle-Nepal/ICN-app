/**
 * Domain models for Inner Circle Nepal Mobile.
 *
 * Mirrors `site/src/lib/types.ts` and `site/src/lib/data/nepse.ts` one-for-one
 * against the live Supabase Postgres schema (`supabase/schema.sql`).
 */

export type CategorySlug =
  | "nepal"
  | "investigations"
  | "diaspora"
  | "immigration"
  | "nepse"
  | "technology"
  | "culture"
  | "sports";

export interface Category {
  id: string;
  slug: CategorySlug | string;
  name: string;
  name_ne: string | null;
  description: string | null;
  /** Hex accent used for category indicators. */
  accent: string | null;
  sort_order: number;
  /**
   * Announced, but not yet open. When true and the category has 0 published
   * stories, its landing view displays `locked_blurb` instead of an empty list.
   */
  is_locked?: boolean;
  locked_blurb?: string | null;
}

export interface Author {
  id: string;
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  avatar_url: string | null;
  /** Where this correspondent files from — e.g. "Sydney, Australia". */
  location: string | null;
  email: string | null;
  x_handle: string | null;
  linkedin_url: string | null;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
}

export interface EditionZone {
  label: string;
  tz: string;
}

export interface Edition {
  slug: string;
  name: string;
  code: string;
  timezone: string;
  zones: EditionZone[];
  currency: string;
}

export type ArticleStatus = "draft" | "scheduled" | "published" | "archived";

export interface Article {
  id: string;
  slug: string;
  title: string;
  title_ne: string | null;
  /** Short deck / standfirst shown under the headline. */
  excerpt: string;
  excerpt_ne: string | null;
  /** Body as HTML. */
  body: string;
  /** Nepali body as HTML, or null when the story has no translation. */
  body_ne: string | null;

  hero_image: string | null;
  hero_alt: string | null;
  hero_credit: string | null;

  category: Category;
  author: Author | null;
  tags: Tag[];

  /** Which diaspora edition(s) this story belongs to. Empty = global. */
  editions: string[];

  status: ArticleStatus;
  published_at: string;
  updated_at: string | null;

  /** Editorial flags that drive homepage placement. */
  is_featured: boolean;
  is_breaking: boolean;
  is_live: boolean;

  reading_minutes: number;
  view_count: number;

  seo_title: string | null;
  seo_description: string | null;
}

/** Lightweight shape for rails, lists, and search — avoids shipping full HTML bodies. */
export type ArticleCard = Omit<Article, "body" | "body_ne">;

export interface LiveUpdate {
  id: string;
  article_id: string;
  posted_at: string;
  headline: string;
  body: string;
}

export interface ForexRate {
  currency: string;
  code: string;
  symbol: string;
  /** NPR per `unit` of `code` — divide by `unit` to convert. */
  buy: number;
  sell: number;
  /** How many units of `code` the quote covers: 1, 10 (JPY) or 100 (INR, KRW). */
  unit: number;
  /** Percentage change against the previous published rate. */
  change: number;
  /** When Nepal Rastra Bank published this rate. */
  updated_at?: string;
}

export interface NepseIndex {
  name: string;
  close: number;
  change: number;
  percentChange: number;
  generatedAt: string | null;
}

export interface NepseScrip {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  percentChange: number;
  volume: number;
  turnover: number;
}

export interface NepseSummaryRow {
  label: string;
  value: number;
}

export interface NepseIndexReading {
  index: NepseIndex | null;
  isOpen: boolean;
}

export interface NepseSnapshot {
  index: NepseIndex | null;
  isOpen: boolean;
  summary: NepseSummaryRow[];
  gainers: NepseScrip[];
  losers: NepseScrip[];
  mostTraded: NepseScrip[];
  scripCount: number;
}

/**
 * Lightweight bookmark record persisted in AsyncStorage.
 *
 * Avoids storing complete article HTML bodies while retaining enough metadata
 * to render the Saved list immediately (even offline) and refresh on demand.
 */
export interface BookmarkRecord {
  slug: string;
  savedAt: string;
  title: string;
  title_ne: string | null;
  excerpt: string;
  hero_image: string | null;
  categorySlug: string;
  categoryName: string;
  authorName: string | null;
  published_at: string;
  reading_minutes: number;
}

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type LanguagePreference = "en" | "ne";

export interface HomeFeedData {
  lead: ArticleCard | null;
  secondLead: ArticleCard[];
  alsoLeading: ArticleCard[];
  latestGrid: ArticleCard[];
  latestBriefs: ArticleCard[];
  immigration: ArticleCard[];
  trending: ArticleCard[];
  investigationsCategory: Category | null;
  investigationStories: ArticleCard[];
  categories: Category[];
  forexRates: ForexRate[];
  nepseReading: NepseIndexReading;
  fetchedAt: string;
}
