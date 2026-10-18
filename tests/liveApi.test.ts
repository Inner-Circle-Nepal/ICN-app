import { describe, expect, it } from "vitest";

// `EXPO_PUBLIC_*` is loaded for every test by `tests/setup.ts`.

describe("live backend & domain verification", () => {
  it("fetches real categories, articles, search results, and forex rates from the Inner Circle Nepal Supabase backend", async () => {
    const {
      getCategories,
      getLatestArticles,
      getArticleBySlug,
      searchArticles,
    } = await import("@/lib/api/queries");
    const { getForexRates } = await import("@/lib/api/forex");

    const categories = await getCategories();
    expect(categories.length).toBeGreaterThanOrEqual(8);
    const slugs = categories.map((c) => c.slug);
    expect(slugs).toContain("nepal");
    expect(slugs).toContain("diaspora");
    expect(slugs).toContain("nepse");

    const latest = await getLatestArticles(5, 0);
    expect(latest.length).toBe(5);
    expect(latest[0].title.length).toBeGreaterThan(5);
    expect(latest[0].category.slug).toBeTruthy();

    const firstArticle = await getArticleBySlug(latest[0].slug);
    expect(firstArticle).not.toBeNull();
    expect(firstArticle?.slug).toBe(latest[0].slug);
    expect(firstArticle?.body.length).toBeGreaterThan(20);

    const searchResults = await searchArticles("Nepal", 5);
    expect(searchResults.length).toBeGreaterThan(0);

    const forex = await getForexRates();
    expect(forex.length).toBeGreaterThan(0);
    expect(forex.some((r) => r.code === "USD")).toBe(true);
  });
});
