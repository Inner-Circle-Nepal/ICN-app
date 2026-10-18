import { describe, expect, it } from "vitest";
import {
  canonicalArticleUrl,
  formatDate,
  formatPercent,
  formatPrice,
  formatRupees,
  perUnit,
} from "@/utils/format";
import {
  bookmarkToArticleCard,
  toBookmarkRecord,
} from "@/lib/storage/bookmarks";
import type { ArticleCard } from "@/types/domain";

describe("format and bookmark serialization", () => {
  it("formats canonical article URLs matching the website route structure", () => {
    expect(canonicalArticleUrl("nepal", "monsoon-forecast-2026")).toBe(
      "https://icn.news/nepal/monsoon-forecast-2026",
    );
  });

  it("formats percentages, prices, and NPR currency cleanly", () => {
    expect(formatPercent(1.456)).toBe("+1.46%");
    expect(formatPercent(-0.82)).toBe("−0.82%");
    expect(formatPrice(139.25)).toBe("139.25");
    expect(formatRupees(250_000_000)).toBe("Rs 25.00 crore");
    expect(perUnit({ buy: 9.2, unit: 10 })).toBeCloseTo(0.92, 4);
  });

  it("formats dates cleanly", () => {
    const formatted = formatDate("2026-04-19T06:00:00Z");
    expect(formatted).toContain("2026");
  });

  it("round-trips an ArticleCard through BookmarkRecord without storing heavy body HTML", () => {
    const card: ArticleCard = {
      id: "art-1",
      slug: "kathmandu-infrastructure-audit",
      title: "Kathmandu Infrastructure Audit",
      title_ne: "काठमाडौँ पूर्वाधार परीक्षण",
      excerpt: "Urban contracts face renewed scrutiny.",
      excerpt_ne: null,
      hero_image: "https://images.example.com/road.jpg",
      hero_alt: "Kathmandu Ring Road",
      hero_credit: "Photo: ICN",
      category: {
        id: "cat-nepal",
        slug: "nepal",
        name: "Nepal",
        name_ne: "नेपाल",
        description: null,
        accent: null,
        sort_order: 1,
      },
      author: {
        id: "auth-1",
        name: "Suman Adhikari",
        slug: "suman-adhikari",
        role: "Correspondent",
        bio: null,
        avatar_url: null,
        location: "Kathmandu",
        email: null,
        x_handle: null,
        linkedin_url: null,
      },
      tags: [],
      editions: ["usa"],
      status: "published",
      published_at: "2026-04-18T10:15:00Z",
      updated_at: null,
      reading_minutes: 6,
      view_count: 42,
      is_featured: true,
      is_breaking: false,
      is_live: false,
      seo_title: null,
      seo_description: null,
    };

    const record = toBookmarkRecord(card);
    expect(record.slug).toBe("kathmandu-infrastructure-audit");
    expect(record.categorySlug).toBe("nepal");

    const restored = bookmarkToArticleCard(record);
    expect(restored.slug).toBe(card.slug);
    expect(restored.title).toBe(card.title);
    expect(restored.category.slug).toBe("nepal");
    expect(restored.author?.name).toBe("Suman Adhikari");
    expect(restored.reading_minutes).toBe(6);
  });
});
