// The sender's decisions, kept free of Deno and Supabase so the app's test
// suite can import them (tests/newsPushPlan.test.ts).

export type ArticleRecord = {
  id: string;
  slug: string;
  title: string;
  title_ne: string | null;
  excerpt: string | null;
  excerpt_ne: string | null;
  hero_image: string | null;
  status: string;
  is_breaking: boolean;
  published_at: string | null;
};

// A story pushes to All news readers only while it's fresh, so an edit to
// an old story never sends it (the log is the main guard; this is the
// backstop for stories the backfill missed).
export const STORY_WINDOW_MS = 24 * 3600 * 1000;

/**
 * Which audiences this database event may still notify. The logs decide
 * whether each one actually goes out (a claim that fails means it already
 * did).
 *   story:    phones with All news on
 *   breaking: phones with Breaking on and All news off
 */
export function audiences(a: ArticleRecord, now: number): { story: boolean; breaking: boolean } {
  const publishedAt = a.published_at ? new Date(a.published_at).getTime() : NaN;
  const live = a.status === "published" && Number.isFinite(publishedAt) && publishedAt <= now;
  if (!live) return { story: false, breaking: false };
  return {
    story: now - publishedAt <= STORY_WINDOW_MS,
    breaking: a.is_breaking,
  };
}

export function trim(text: string | null | undefined, max: number): string {
  const clean = (text ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// The story's photo, shown expanded under the alert (Android out of the box;
// iOS would need a Notification Service Extension). Our own storage images
// go through the resizer so a phone downloads ~80 KB, not the original.
export function alertImage(url: string | null): string | undefined {
  if (!url || !/^https:\/\//.test(url)) return undefined;
  const resized = url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  return resized === url ? url : `${resized}?width=800&quality=70`;
}

/**
 * One phone's push for a story. A breaking story looks the same to everyone
 * ("Breaking news" + headline, high priority); any other story is a quieter
 * headline + excerpt on its own Android channel.
 */
export function storyMessage(a: ArticleRecord, token: string, language: string) {
  const ne = language === "ne";
  const title = trim((ne && a.title_ne) || a.title, 178);
  const image = alertImage(a.hero_image);
  const common = {
    to: token,
    subtitle: "Inner Circle Nepal",
    sound: "default",
    ...(image ? { richContent: { image } } : {}),
  };

  if (a.is_breaking) {
    return {
      ...common,
      title: ne && a.title_ne ? "ताजा समाचार" : "Breaking news",
      body: title,
      priority: "high",
      channelId: "breaking-news",
      threadId: "breaking",
      // Breaking news that arrives a day late is not breaking.
      ttl: 6 * 3600,
      data: { path: `/article/${a.slug}`, slug: a.slug, tag: "breaking" },
    };
  }

  const excerpt = trim((ne && a.excerpt_ne) || a.excerpt, 178);
  return {
    ...common,
    title,
    ...(excerpt ? { body: excerpt } : {}),
    priority: "default",
    channelId: "news",
    threadId: "news",
    ttl: 12 * 3600,
    data: { path: `/article/${a.slug}`, slug: a.slug, tag: "story" },
  };
}
