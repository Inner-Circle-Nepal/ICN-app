import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Article, ArticleCard, BookmarkRecord } from "@/types/domain";
import {
  bookmarkToArticleCard,
  loadBookmarks,
  saveBookmarks,
  toBookmarkRecord,
} from "@/lib/storage/bookmarks";

interface BookmarksContextValue {
  bookmarks: BookmarkRecord[];
  bookmarkedCards: ArticleCard[];
  hydrated: boolean;
  isBookmarked: (slug: string) => boolean;
  toggleBookmark: (article: ArticleCard | Article) => boolean;
  removeBookmark: (slug: string) => void;
  clearAllBookmarks: () => void;
}

const BookmarksContext = createContext<BookmarksContextValue>({
  bookmarks: [],
  bookmarkedCards: [],
  hydrated: false,
  isBookmarked: () => false,
  toggleBookmark: () => false,
  removeBookmark: () => {},
  clearAllBookmarks: () => {},
});

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /**
   * Edits made before the stored list has loaded.
   *
   * The Save button is on screen (the lead story carries one) from the first
   * frame, while reading AsyncStorage takes until the next tick or longer on a
   * cold start. Writing straight through in that window persists a list built
   * on an empty array and erases everything the reader had already saved, so
   * early edits are queued here and replayed onto the loaded list instead.
   */
  const pendingRef = useRef<((current: BookmarkRecord[]) => BookmarkRecord[])[]>([]);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let active = true;
    loadBookmarks()
      .then((loaded) => {
        if (!active) return;
        const replayed = pendingRef.current.reduce(
          (list, edit) => edit(list),
          loaded,
        );
        pendingRef.current = [];
        hydratedRef.current = true;
        setBookmarks(replayed);
        setHydrated(true);
        if (replayed !== loaded) void saveBookmarks(replayed);
      })
      .catch(() => {
        if (!active) return;
        hydratedRef.current = true;
        setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Applies an edit to the current list and persists the result.
   *
   * The edit runs inside the state updater rather than against a captured
   * `bookmarks`, so two taps in the same tick both land instead of the second
   * overwriting the first with a stale list.
   */
  const commit = useCallback(
    (edit: (current: BookmarkRecord[]) => BookmarkRecord[]) => {
      if (!hydratedRef.current) {
        pendingRef.current.push(edit);
      }
      setBookmarks((current) => {
        const next = edit(current);
        if (hydratedRef.current) void saveBookmarks(next);
        return next;
      });
    },
    [],
  );

  const slugSet = useMemo(
    () => new Set(bookmarks.map((b) => b.slug)),
    [bookmarks],
  );

  const isBookmarked = useCallback(
    (slug: string) => slugSet.has(slug),
    [slugSet],
  );

  const toggleBookmark = useCallback(
    (article: ArticleCard | Article): boolean => {
      const willSave = !slugSet.has(article.slug);
      const record = toBookmarkRecord(article);
      commit((current) =>
        current.some((b) => b.slug === article.slug)
          ? current.filter((b) => b.slug !== article.slug)
          : [record, ...current],
      );
      return willSave;
    },
    [commit, slugSet],
  );

  const removeBookmark = useCallback(
    (slug: string) => {
      commit((current) => current.filter((b) => b.slug !== slug));
    },
    [commit],
  );

  const clearAllBookmarks = useCallback(() => {
    commit(() => []);
  }, [commit]);

  const bookmarkedCards = useMemo(
    () => bookmarks.map(bookmarkToArticleCard),
    [bookmarks],
  );

  const value = useMemo<BookmarksContextValue>(
    () => ({
      bookmarks,
      bookmarkedCards,
      hydrated,
      isBookmarked,
      toggleBookmark,
      removeBookmark,
      clearAllBookmarks,
    }),
    [
      bookmarks,
      bookmarkedCards,
      hydrated,
      isBookmarked,
      toggleBookmark,
      removeBookmark,
      clearAllBookmarks,
    ],
  );

  return (
    <BookmarksContext.Provider value={value}>
      {children}
    </BookmarksContext.Provider>
  );
}

export function useBookmarks(): BookmarksContextValue {
  return useContext(BookmarksContext);
}
