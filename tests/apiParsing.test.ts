import { describe, expect, it } from "vitest";
import { normaliseArticleRow } from "@/lib/api/queries";
import { IMAGE_WIDTHS, sizedImageUrl } from "@/utils/images";
import { bookmarkToArticleCard, toBookmarkRecord } from "@/lib/storage/bookmarks";
import { SUPABASE_URL } from "@/constants/config";
import type { Article, ArticleCard } from "@/types/domain";

/**
 * The shapes below are what PostgREST actually returns for the select in
 * `constants/config.ts`. Embedded one-to-one relations come back as an object
 * or, depending on how the relationship is resolved, a single-element array;
 * tags arrive as rows wrapping the joined tag. Getting this wrong does not
 * fail a type check — the rows cross the boundary as `unknown` — so it is
 * asserted here instead.
 */

const category = {
  id: "cat-1",
  slug: "nepal",
  name: "Nepal",
  name_ne: "नेपाल",
  description: null,
  accent: null,
  sort_order: 1,
};

const author = {
  id: "auth-1",
  slug: "r-shrestha",
  name: "R. Shrestha",
  role: "Correspondent",
  bio: null,
  avatar_url: null,
  location: "Kathmandu",
  email: null,
  x_handle: null,
  linkedin_url: null,
};

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "a-1",
    slug: "a-story",
    title: "A story",
    title_ne: null,
    excerpt: "Standfirst",
    excerpt_ne: null,
    hero_image: null,
    hero_alt: null,
    hero_credit: null,
    editions: ["usa"],
    status: "published",
    published_at: "2026-10-01T00:00:00.000Z",
    updated_at: null,
    is_featured: false,
    is_breaking: false,
    is_live: false,
    reading_minutes: 5,
    view_count: 12,
    seo_title: null,
    seo_description: null,
    category,
    author,
    tags: [],
    ...overrides,
  };
}

describe("normaliseArticleRow", () => {
  it("unwraps an embedded relation returned as an object", () => {
    const row = normaliseArticleRow<ArticleCard>(baseRow());
    expect(row.category.slug).toBe("nepal");
    expect(row.author?.name).toBe("R. Shrestha");
  });

  it("unwraps an embedded relation returned as a single-element array", () => {
    const row = normaliseArticleRow<ArticleCard>(
      baseRow({ category: [category], author: [author] }),
    );
    expect(row.category.slug).toBe("nepal");
    expect(row.author?.name).toBe("R. Shrestha");
  });

  it("flattens the article_tags join into a plain tag list", () => {
    const row = normaliseArticleRow<ArticleCard>(
      baseRow({
        tags: [
          { tag: { id: "t1", slug: "nepse", name: "NEPSE" } },
          { tag: [{ id: "t2", slug: "visas", name: "Visas" }] },
          { tag: null },
          null,
        ],
      }),
    );
    expect(row.tags.map((t) => t.slug)).toEqual(["nepse", "visas"]);
  });

  it("tolerates a story filed with no author — which is every live story today", () => {
    const row = normaliseArticleRow<ArticleCard>(baseRow({ author: null }));
    expect(row.author).toBeNull();
    expect(row.category.slug).toBe("nepal");
  });

  it("coerces counters that arrive null, absent or as strings", () => {
    const row = normaliseArticleRow<ArticleCard>(
      baseRow({ reading_minutes: null, view_count: "not a number" }),
    );
    expect(row.reading_minutes).toBe(1);
    expect(row.view_count).toBe(0);

    const stringy = normaliseArticleRow<ArticleCard>(
      baseRow({ reading_minutes: "7", view_count: "104" }),
    );
    expect(stringy.reading_minutes).toBe(7);
    expect(stringy.view_count).toBe(104);
  });

  it("always produces an editions array, even when the column is null", () => {
    expect(normaliseArticleRow<ArticleCard>(baseRow({ editions: null })).editions).toEqual([]);
    expect(normaliseArticleRow<ArticleCard>(baseRow()).editions).toEqual(["usa"]);
  });

  it("reports body_ne as null when the column is absent from the response", () => {
    // The Nepali-body migration is not applied in production, so the select
    // falls back to one without `body_ne`.
    const row = normaliseArticleRow<Article>(baseRow({ body: "<p>Copy</p>" }));
    expect(row.body_ne).toBeNull();
    expect(row.body).toBe("<p>Copy</p>");
  });
});

describe("sizedImageUrl", () => {
  // Built from whatever project `.env` configures, so the suite is not tied
  // to one Supabase instance.
  const host = SUPABASE_URL ? new URL(SUPABASE_URL).host : "";
  const storage = `https://${host}/storage/v1/object/public/media/2026/hero.jpg`;

  it("is configured — otherwise the rewrites below cannot be exercised", () => {
    expect(host, "EXPO_PUBLIC_SUPABASE_URL must be set in mobile/.env").not.toBe("");
  });

  it("routes a Supabase Storage object through the render endpoint at the asked-for width", () => {
    const out = sizedImageUrl(storage, IMAGE_WIDTHS.thumb);
    expect(out).toContain("/storage/v1/render/image/public/media/2026/hero.jpg");
    expect(out).toContain("width=400");
    expect(out).toContain("quality=70");
  });

  it("leaves a third-party hero untouched", () => {
    // Live stories carry heroes from i.guim.co.uk, ibb.co and foxnews; the
    // render endpoint cannot resize what this project does not store.
    for (const foreign of [
      "https://i.guim.co.uk/img/media/abc/master/1000.jpg",
      "https://a57.foxnews.com/static/photo.jpg",
      "https://ibb.co/abc123",
    ]) {
      expect(sizedImageUrl(foreign, IMAGE_WIDTHS.card)).toBe(foreign);
    }
  });

  it("passes through anything that is not a parseable absolute URL", () => {
    expect(sizedImageUrl("/local/relative.jpg", IMAGE_WIDTHS.card)).toBe("/local/relative.jpg");
    expect(sizedImageUrl("", IMAGE_WIDTHS.card)).toBeUndefined();
    expect(sizedImageUrl(null, IMAGE_WIDTHS.card)).toBeUndefined();
    expect(sizedImageUrl(undefined, IMAGE_WIDTHS.card)).toBeUndefined();
  });

  it("does not transform a Supabase URL that is not a public storage object", () => {
    const rest = `https://${host}/rest/v1/articles?select=*`;
    expect(sizedImageUrl(rest, IMAGE_WIDTHS.card)).toBe(rest);
  });
});

describe("bookmark record round-trip", () => {
  it("keeps what the saved list renders and drops the article body", () => {
    const article = normaliseArticleRow<Article>(
      baseRow({ body: "<p>A very long body</p>", hero_image: "https://x/y.jpg" }),
    );

    const record = toBookmarkRecord(article);
    expect(record).not.toHaveProperty("body");
    expect(record.slug).toBe("a-story");
    expect(record.categoryName).toBe("Nepal");
    expect(record.authorName).toBe("R. Shrestha");

    const card = bookmarkToArticleCard(record);
    expect(card.slug).toBe(article.slug);
    expect(card.title).toBe(article.title);
    expect(card.hero_image).toBe("https://x/y.jpg");
    expect(card.category.slug).toBe("nepal");
    expect(card.reading_minutes).toBe(5);
  });

  it("round-trips a story with no author", () => {
    const article = normaliseArticleRow<Article>(baseRow({ author: null, body: "" }));
    const card = bookmarkToArticleCard(toBookmarkRecord(article));
    expect(card.author).toBeNull();
  });
});
