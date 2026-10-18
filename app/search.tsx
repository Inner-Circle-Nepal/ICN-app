import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";

import {
  useSearchArticles,
  useTagArticles,
  useTags,
} from "@/features/search/useSearch";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
} from "@/lib/storage/preferences";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { SearchInput } from "@/components/SearchInput";
import { SectionRule } from "@/components/SectionRule";
import { ArticleCard } from "@/components/ArticleCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

/**
 * Search & Topic Discovery Screen (`app/search.tsx`).
 *
 * Mirrors `site/src/app/(site)/search/page.tsx`:
 *   - Uses real Postgres Full-Text Search (`search_vector`) for English queries
 *     and `ilike` fallback for Nepali / Devanagari queries
 *   - Supports filtering by Topic Tag (`?tag=nepse`, etc.)
 *   - Persists recent searches in `AsyncStorage`
 */
export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; tag?: string }>();
  const { palette } = useTheme();

  const [query, setQuery] = useState(params.q ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(params.q ?? "");
  const [activeTag, setActiveTag] = useState<string | null>(params.tag ?? null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  /*
   * Route params seed the initial state above, so this only has to react to
   * a *later* change — arriving from a deep link while the screen is already
   * open. Re-applying them on mount set state synchronously inside an effect
   * and cost an extra render of the whole result list on every open.
   */
  const appliedParams = useRef(`${params.q ?? ""}|${params.tag ?? ""}`);
  useEffect(() => {
    const incoming = `${params.q ?? ""}|${params.tag ?? ""}`;
    if (incoming === appliedParams.current) return;
    appliedParams.current = incoming;

    /*
     * `set-state-in-effect` guards against an effect that re-runs on its own
     * output. The comparison above makes that impossible: this body runs only
     * when the route hands the screen different params than it last applied,
     * which is an external event, not a render cascade.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.tag) setActiveTag(params.tag);
    if (params.q) {
      setQuery(params.q);
      setDebouncedQuery(params.q);
    }
  }, [params.q, params.tag]);

  useEffect(() => {
    void getRecentSearches().then(setRecentSearches);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const searchQuery = useSearchArticles(debouncedQuery);
  const tagArticlesQuery = useTagArticles(
    debouncedQuery.length < 2 ? activeTag : null,
  );
  const tagsQuery = useTags();

  const handleSubmit = async () => {
    const cleaned = query.trim();
    if (cleaned.length >= 2) {
      setDebouncedQuery(cleaned);
      const updated = await addRecentSearch(cleaned);
      setRecentSearches(updated);
    }
  };

  const handleSelectRecent = async (term: string) => {
    setActiveTag(null);
    setQuery(term);
    setDebouncedQuery(term);
    const updated = await addRecentSearch(term);
    setRecentSearches(updated);
  };

  const handleClearRecents = async () => {
    await clearRecentSearches();
    setRecentSearches([]);
  };

  const isSearchingText = debouncedQuery.length >= 2;
  const isFilteringTag = !isSearchingText && Boolean(activeTag);

  const results = isSearchingText
    ? searchQuery.data ?? []
    : isFilteringTag
      ? tagArticlesQuery.data ?? []
      : [];

  const isLoading = isSearchingText
    ? searchQuery.isLoading
    : isFilteringTag
      ? tagArticlesQuery.isLoading
      : false;

  const isError = isSearchingText
    ? searchQuery.isError
    : isFilteringTag
      ? tagArticlesQuery.isError
      : false;

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      {/* Top Bar */}
      <View
        style={[
          styles.topBar,
          { borderBottomColor: palette.rule },
        ]}
      >
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/");
            }
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M19 12H5M11 6l-6 6 6 6"
              stroke={palette.ink}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={[styles.backText, { color: palette.ink }]}>Back</Text>
        </Pressable>

        <Text style={[styles.topTitle, { color: palette.quiet }]}>
          Archive Search
        </Text>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={[styles.kicker, { color: palette.quiet }]}>
              Search the newsroom
            </Text>
            <Text style={[styles.headline, { color: palette.ink }]}>
              Find stories, dispatches & topics
            </Text>

            <SearchInput
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                if (text.trim().length > 0 && activeTag) {
                  setActiveTag(null);
                }
              }}
              onSubmit={() => void handleSubmit()}
              autoFocus={!params.tag}
              style={styles.searchInput}
            />

            {/* Active Tag Filter Banner */}
            {isFilteringTag && activeTag ? (
              <View
                style={[
                  styles.activeTagBar,
                  {
                    backgroundColor: palette.paper2,
                    borderColor: palette.rule2,
                  },
                ]}
              >
                <Text style={[styles.activeTagLabel, { color: palette.ink }]}>
                  Topic: #{activeTag}
                </Text>
                <Pressable
                  onPress={() => setActiveTag(null)}
                  hitSlop={8}
                >
                  <Text
                    style={[styles.clearTagBtn, { color: palette.quiet }]}
                  >
                    Clear filter
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* Idle state: Recent Searches + Topics */}
            {!isSearchingText && !isFilteringTag ? (
              <View style={styles.idlePanels}>
                {recentSearches.length > 0 ? (
                  <View style={styles.panelSection}>
                    <SectionRule
                      title="Recent searches"
                      cta="Clear"
                      onPressCta={() => void handleClearRecents()}
                    />
                    <View style={styles.chipsWrap}>
                      {recentSearches.map((term) => (
                        <Pressable
                          key={term}
                          onPress={() => void handleSelectRecent(term)}
                          style={[
                            styles.chip,
                            { borderColor: palette.rule2 },
                          ]}
                        >
                          <Text
                            style={[styles.chipText, { color: palette.ink }]}
                          >
                            {term}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                {tagsQuery.data && tagsQuery.data.length > 0 ? (
                  <View style={styles.panelSection}>
                    <SectionRule title="Browse by topic" />
                    <View style={styles.chipsWrap}>
                      {tagsQuery.data.map((t) => (
                        <Pressable
                          key={t.slug}
                          onPress={() => {
                            setQuery("");
                            setDebouncedQuery("");
                            setActiveTag(t.slug);
                          }}
                          style={[
                            styles.chip,
                            {
                              borderColor:
                                activeTag === t.slug
                                  ? palette.ink
                                  : palette.rule2,
                              backgroundColor:
                                activeTag === t.slug
                                  ? palette.paper2
                                  : "transparent",
                            },
                          ]}
                        >
                          <Text
                            style={[styles.chipText, { color: palette.ink }]}
                          >
                            #{t.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.resultsHeader}>
                <SectionRule
                  title={
                    isSearchingText
                      ? `Results for "${debouncedQuery}"`
                      : `Stories tagged #${activeTag}`
                  }
                  cta={isLoading ? "Searching…" : `${results.length} found`}
                />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={palette.ink} />
            </View>
          ) : isError ? (
            <ErrorState
              title="Search unavailable"
              message="We could not complete your search right now."
              onRetry={() =>
                void (isSearchingText
                  ? searchQuery.refetch()
                  : tagArticlesQuery.refetch())
              }
            />
          ) : isSearchingText || isFilteringTag ? (
            <EmptyState
              kicker="0 matches"
              title="No matching dispatches found"
              description="Try searching with a broader keyword, place name, or browse by section in Explore."
              actionLabel="Browse sections"
              onAction={() => router.push("/explore")}
            />
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.resultRow,
              index > 0 && {
                borderTopWidth: 1,
                borderTopColor: palette.rule,
              },
            ]}
          >
            <ArticleCard article={item} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    height: 48,
    paddingHorizontal: spacing.gutter,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
  },
  backText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  topTitle: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  listContent: {
    paddingHorizontal: spacing.gutter,
    paddingBottom: 40,
  },
  headerBlock: {
    paddingTop: 20,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  headline: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.5,
    marginTop: 6,
  },
  searchInput: {
    marginTop: 16,
  },
  activeTagBar: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeTagLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  clearTagBtn: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  idlePanels: {
    marginTop: 26,
    gap: 24,
  },
  panelSection: {},
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12.5,
  },
  resultsHeader: {
    marginTop: 26,
  },
  resultRow: {
    paddingVertical: 18,
  },
  loaderWrap: {
    paddingVertical: 32,
    alignItems: "center",
  },
});
