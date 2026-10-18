// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the saved-stories provider.
 *
 * The provider renders no native views — only a context provider — so it can
 * be mounted with `react-dom` and driven directly. AsyncStorage is the one
 * native module it reaches, and it is replaced below with an in-memory store
 * whose read can be held open, which is what makes the cold-start race
 * reproducible rather than a matter of timing luck.
 */

let store: Record<string, string> = {};
let releaseRead: (() => void) | null = null;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => {
      if (releaseRead) {
        await new Promise<void>((resolve) => {
          releaseRead = () => resolve();
        });
      }
      return store[key] ?? null;
    }),
    setItem: vi.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete store[key];
    }),
  },
}));

const BOOKMARKS_KEY = "icn-saved-bookmarks-v1";

import { BookmarksProvider, useBookmarks } from "@/features/bookmarks/BookmarksContext";
import type { ArticleCard } from "@/types/domain";

function makeArticle(slug: string, title = `Story ${slug}`): ArticleCard {
  return {
    id: `id-${slug}`,
    slug,
    title,
    title_ne: null,
    excerpt: "Standfirst.",
    excerpt_ne: null,
    hero_image: null,
    hero_alt: null,
    hero_credit: null,
    category: {
      id: "cat-nepal",
      slug: "nepal",
      name: "Nepal",
      name_ne: null,
      description: null,
      accent: null,
      sort_order: 1,
    },
    author: null,
    tags: [],
    editions: [],
    status: "published",
    published_at: "2026-10-01T00:00:00.000Z",
    updated_at: null,
    is_featured: false,
    is_breaking: false,
    is_live: false,
    reading_minutes: 4,
    view_count: 0,
    seo_title: null,
    seo_description: null,
  };
}

type Api = ReturnType<typeof useBookmarks>;

let api: Api;
let container: HTMLDivElement;
let root: Root;

function Probe() {
  api = useBookmarks();
  return null;
}

async function mount() {
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => {
    root.render(
      <BookmarksProvider>
        <Probe />
      </BookmarksProvider>,
    );
  });
}

function storedSlugs(): string[] {
  const raw = store[BOOKMARKS_KEY];
  return raw ? (JSON.parse(raw) as { slug: string }[]).map((b) => b.slug) : [];
}

beforeEach(() => {
  store = {};
  releaseRead = null;
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
});

describe("BookmarksProvider", () => {
  it("loads previously saved stories on launch", async () => {
    store[BOOKMARKS_KEY] = JSON.stringify([
      { slug: "old-one", title: "Old one", savedAt: "2026-01-01T00:00:00.000Z" },
    ]);

    await mount();

    expect(api.hydrated).toBe(true);
    expect(api.bookmarks.map((b) => b.slug)).toEqual(["old-one"]);
    expect(api.isBookmarked("old-one")).toBe(true);
  });

  it("does not erase stored bookmarks when one is saved before hydration finishes", async () => {
    // Three stories the reader saved on a previous launch.
    store[BOOKMARKS_KEY] = JSON.stringify(
      ["alpha", "beta", "gamma"].map((slug) => ({
        slug,
        title: slug,
        savedAt: "2026-01-01T00:00:00.000Z",
      })),
    );

    // Hold the read open so the provider is still un-hydrated when we tap.
    releaseRead = () => {};
    await mount();
    expect(api.hydrated).toBe(false);

    // The lead story carries a Save button and is on screen from frame one.
    await act(async () => {
      api.toggleBookmark(makeArticle("brand-new"));
    });

    // Storage finally answers.
    await act(async () => {
      releaseRead?.();
      await Promise.resolve();
    });

    expect(api.hydrated).toBe(true);
    expect(api.bookmarks.map((b) => b.slug).sort()).toEqual([
      "alpha",
      "beta",
      "brand-new",
      "gamma",
    ]);
    expect(storedSlugs().sort()).toEqual(["alpha", "beta", "brand-new", "gamma"]);
  });

  it("keeps both edits when two stories are saved in the same tick", async () => {
    await mount();

    await act(async () => {
      api.toggleBookmark(makeArticle("one"));
      api.toggleBookmark(makeArticle("two"));
    });

    expect(api.bookmarks.map((b) => b.slug).sort()).toEqual(["one", "two"]);
    expect(storedSlugs().sort()).toEqual(["one", "two"]);
  });

  it("toggles a story off again and persists the removal", async () => {
    await mount();

    await act(async () => {
      api.toggleBookmark(makeArticle("toggle-me"));
    });
    expect(api.isBookmarked("toggle-me")).toBe(true);

    await act(async () => {
      api.toggleBookmark(makeArticle("toggle-me"));
    });
    expect(api.isBookmarked("toggle-me")).toBe(false);
    expect(storedSlugs()).toEqual([]);
  });

  it("reports which way a toggle went", async () => {
    await mount();

    let saved: boolean | undefined;
    await act(async () => {
      saved = api.toggleBookmark(makeArticle("direction"));
    });
    expect(saved).toBe(true);

    await act(async () => {
      saved = api.toggleBookmark(makeArticle("direction"));
    });
    expect(saved).toBe(false);
  });

  it("removes and clears, persisting each", async () => {
    await mount();

    await act(async () => {
      api.toggleBookmark(makeArticle("a"));
      api.toggleBookmark(makeArticle("b"));
    });

    await act(async () => {
      api.removeBookmark("a");
    });
    expect(storedSlugs()).toEqual(["b"]);

    await act(async () => {
      api.clearAllBookmarks();
    });
    expect(api.bookmarks).toEqual([]);
    expect(storedSlugs()).toEqual([]);
  });

  it("survives corrupt stored data instead of crashing on launch", async () => {
    store[BOOKMARKS_KEY] = "{not json at all";

    await mount();

    expect(api.hydrated).toBe(true);
    expect(api.bookmarks).toEqual([]);
  });

  it("discards stored entries that are missing required fields", async () => {
    store[BOOKMARKS_KEY] = JSON.stringify([
      { slug: "good", title: "Good" },
      { slug: 42, title: "Bad slug" },
      { title: "No slug" },
      null,
    ]);

    await mount();

    expect(api.bookmarks.map((b) => b.slug)).toEqual(["good"]);
  });
});
