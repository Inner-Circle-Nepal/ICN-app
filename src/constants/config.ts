/**
 * Public Supabase and API configuration.
 *
 * Uses EXPO_PUBLIC_* variables which are safe for client-side use because
 * Postgres Row-Level Security (RLS) enforces read-only access on published
 * articles, categories, authors, tags, and forex rates.
 */

export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "https://icn.news").replace(
  /\/$/,
  "",
);

/**
 * Where the Chautari endpoints live.
 *
 * A separate origin from `SITE_URL` on purpose. The public website is hosted
 * independently of the live-audio infrastructure, and the Chautari API runs
 * beside the media server so a join token is minted next to the server that
 * has to honour it. Keeping it a distinct variable means either side can
 * move without the other being rebuilt.
 *
 * Shares nothing sensitive: these endpoints authenticate the reader's Clerk
 * session and return a short-lived grant. No LiveKit credential is involved
 * on this side of the call.
 */
export const CHAUTARI_API_URL = (
  process.env.EXPO_PUBLIC_CHAUTARI_API_URL ?? "https://api.icn.news"
).replace(/\/$/, "");

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

/**
 * Clerk's publishable key.
 *
 * Publishable by name and by nature — it identifies the Clerk application to
 * their servers and is designed to ship in a client. The SECRET key stays on
 * the website and must never appear here.
 *
 * When this is unset the app behaves exactly as it did before accounts
 * existed: Chautari is hidden, and reading, search and bookmarks are
 * untouched. Nothing degrades except the feature that needs an account.
 */
export const CLERK_PUBLISHABLE_KEY = (
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""
).trim();

export const isClerkConfigured = CLERK_PUBLISHABLE_KEY.startsWith("pk_");

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;

/** Columns pulled for list views — deliberately excludes the article body. */
export const CARD_COLUMNS = `
  id, slug, title, title_ne, excerpt, excerpt_ne,
  hero_image, hero_alt, hero_credit,
  editions, status, published_at, updated_at,
  is_featured, is_breaking, is_live,
  reading_minutes, view_count, seo_title, seo_description,
  category:categories!inner ( id, slug, name, name_ne, description, accent, sort_order ),
  author:authors ( id, slug, name, role, bio, avatar_url, location, email, x_handle, linkedin_url ),
  tags:article_tags ( tag:tags ( id, slug, name ) )
`;

export const FULL_COLUMNS = `${CARD_COLUMNS}, body`;

/**
 * As FULL_COLUMNS, plus the Nepali body (`body_ne`).
 *
 * Separate rather than merged in, because PostgREST fails an ENTIRE query on
 * one unknown column (`42703 undefined_column`). The data layer asks for
 * FULL_COLUMNS_NE first and automatically falls back to FULL_COLUMNS when
 * `2026-10-nepali-bodies.sql` has not yet been applied.
 */
export const FULL_COLUMNS_NE = `${FULL_COLUMNS}, body_ne`;

export const PAGE_SIZE = 16;
