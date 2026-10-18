import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import {
  useCategories,
  useInfiniteCategoryArticles,
} from "@/features/categories/useCategories";
import { useTags } from "@/features/search/useSearch";
import { useForexRates, useNepseSnapshot } from "@/features/market/useMarket";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { AppHeader } from "@/components/AppHeader";
import { SectionRule } from "@/components/SectionRule";
import { ArticleCard } from "@/components/ArticleCard";
import { ForexWidget } from "@/components/ForexWidget";
import { NepseBoard } from "@/components/NepseBoard";
import { EmptyState } from "@/components/EmptyState";
import type { ArticleCard as ArticleCardType } from "@/types/domain";

/**
 * Explore & Section Discovery Screen (`app/explore.tsx`).
 *
 * Provides:
 *   - Quick Search bar launcher
 *   - Interactive directory of all 8 real categories (`nepal`, `investigations`,
 *     `diaspora`, `immigration`, `nepse`, `technology`, `culture`, `sports`)
 *   - Popular Topic Tags from the live `tags` table
 *   - Collapsible NRB Forex & Remittance Converter + NEPSE Market Board
 *   - Live infinite feed for the currently selected category
 */
export default function ExploreScreen() {
  const router = useRouter();
  const { palette, language } = useTheme();

  const categoriesQuery = useCategories();
  const tagsQuery = useTags();
  const forexQuery = useForexRates();
  const nepseQuery = useNepseSnapshot();

  const [selectedSlug, setSelectedSlug] = useState<string>("nepal");
  const [showTools, setShowTools] = useState<"none" | "forex" | "nepse">("none");

  const articlesQuery = useInfiniteCategoryArticles(selectedSlug);

  const categories = categoriesQuery.data ?? [];
  const activeCategory =
    categories.find((c) => c.slug === selectedSlug) ?? categories[0] ?? null;

  const articles = useMemo<ArticleCardType[]>(() => {
    const pages = articlesQuery.data?.pages ?? [];
    const seen = new Set<string>();
    const list: ArticleCardType[] = [];
    for (const page of pages) {
      for (const item of page) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          list.push(item);
        }
      }
    }
    return list;
  }, [articlesQuery.data?.pages]);

  const isRefreshing =
    articlesQuery.isRefetching && !articlesQuery.isFetchingNextPage;

  const handleRefresh = async () => {
    await Promise.all([
      categoriesQuery.refetch(),
      tagsQuery.refetch(),
      articlesQuery.refetch(),
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <AppHeader
        categories={categories}
        activeCategorySlug={selectedSlug}
        onSelectCategory={(slug) => setSelectedSlug(slug)}
      />

      <FlatList
        data={articles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={palette.ink}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (articlesQuery.hasNextPage && !articlesQuery.isFetchingNextPage) {
            void articlesQuery.fetchNextPage();
          }
        }}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* Page Title + Search Trigger */}
            <View
              style={[
                styles.heroHeader,
                { borderBottomColor: palette.ink },
              ]}
            >
              <Text style={[styles.kicker, { color: palette.quiet }]}>
                Discovery · Sections & desks
              </Text>
              <Text style={[styles.title, { color: palette.ink }]}>
                Explore the Newsroom
              </Text>

              <Pressable
                onPress={() => router.push("/search")}
                accessibilityRole="search"
                accessibilityLabel="Search articles, reporters, and topics"
                style={[
                  styles.searchLauncher,
                  {
                    borderColor: palette.rule2,
                    backgroundColor: palette.paper2,
                  },
                ]}
              >
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                  <Circle
                    cx={11}
                    cy={11}
                    r={7}
                    stroke={palette.quiet}
                    strokeWidth={1.6}
                  />
                  <Path
                    d="m16.5 16.5 4.5 4.5"
                    stroke={palette.quiet}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                </Svg>
                <Text
                  style={[styles.searchPlaceholder, { color: palette.quiet }]}
                >
                  Search headlines, dispatches, or topics…
                </Text>
              </Pressable>
            </View>

            {/* Editorial Desks Grid */}
            <View style={styles.desksSection}>
              <SectionRule
                title="Editorial sections"
                cta={`${categories.length} desks`}
              />
              <View
                style={[
                  styles.desksGrid,
                  { borderColor: palette.rule },
                ]}
              >
                {categories.map((cat) => {
                  const isSelected = cat.slug === selectedSlug;
                  return (
                    <Pressable
                      key={cat.slug}
                      onPress={() => setSelectedSlug(cat.slug)}
                      onLongPress={() =>
                        router.push(`/category/${encodeURIComponent(cat.slug)}`)
                      }
                      style={[
                        styles.deskCell,
                        {
                          borderColor: palette.rule,
                          backgroundColor: isSelected
                            ? palette.paper2
                            : "transparent",
                        },
                      ]}
                    >
                      <View style={styles.deskTitleRow}>
                        <Text
                          style={[
                            styles.deskName,
                            {
                              color: palette.ink,
                              textDecorationLine: isSelected
                                ? "underline"
                                : "none",
                            },
                          ]}
                        >
                          {language === "ne" && cat.name_ne
                            ? cat.name_ne
                            : cat.name}
                        </Text>
                        {cat.is_locked ? (
                          <Svg
                            width={10}
                            height={10}
                            viewBox="0 0 12 12"
                            fill="none"
                          >
                            <Rect
                              x={2}
                              y={5.5}
                              width={8}
                              height={5.5}
                              rx={1}
                              stroke={palette.quiet}
                              strokeWidth={1.2}
                            />
                            <Path
                              d="M3.8 5.5V3.8a2.2 2.2 0 0 1 4.4 0v1.7"
                              stroke={palette.quiet}
                              strokeWidth={1.2}
                            />
                          </Svg>
                        ) : null}
                      </View>
                      {cat.description ? (
                        <Text
                          numberOfLines={2}
                          style={[styles.deskDesc, { color: palette.quiet }]}
                        >
                          {cat.description}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Market & Remittance Reference Tools */}
            <View style={styles.toolsSection}>
              <View style={styles.toolsBar}>
                <Pressable
                  onPress={() =>
                    setShowTools(showTools === "forex" ? "none" : "forex")
                  }
                  style={[
                    styles.toolButton,
                    {
                      borderColor:
                        showTools === "forex" ? palette.ink : palette.rule2,
                      backgroundColor:
                        showTools === "forex" ? palette.paper2 : "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.toolButtonText, { color: palette.ink }]}>
                    {showTools === "forex"
                      ? "Hide NRB Remittance Desk"
                      : "NRB Forex & Remittance Converter"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    setShowTools(showTools === "nepse" ? "none" : "nepse")
                  }
                  style={[
                    styles.toolButton,
                    {
                      borderColor:
                        showTools === "nepse" ? palette.ink : palette.rule2,
                      backgroundColor:
                        showTools === "nepse" ? palette.paper2 : "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.toolButtonText, { color: palette.ink }]}>
                    {showTools === "nepse"
                      ? "Hide NEPSE Board"
                      : "Live NEPSE Market Board"}
                  </Text>
                </Pressable>
              </View>

              {showTools === "forex" && forexQuery.data ? (
                <View style={styles.toolPanel}>
                  <ForexWidget rates={forexQuery.data} />
                </View>
              ) : null}

              {showTools === "nepse" && nepseQuery.data ? (
                <View style={styles.toolPanel}>
                  <NepseBoard snapshot={nepseQuery.data} />
                </View>
              ) : null}
            </View>

            {/* Topic Tags */}
            {tagsQuery.data && tagsQuery.data.length > 0 ? (
              <View style={styles.tagsSection}>
                <SectionRule title="Topics in the news" />
                <View style={styles.tagsRow}>
                  {tagsQuery.data.map((t) => (
                    <Pressable
                      key={t.slug}
                      onPress={() =>
                        router.push({
                          pathname: "/search",
                          params: { tag: t.slug },
                        })
                      }
                      style={[
                        styles.tagChip,
                        { borderColor: palette.rule2 },
                      ]}
                    >
                      <Text style={[styles.tagText, { color: palette.ink }]}>
                        #{t.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Active Section Feed Header */}
            <View style={styles.feedHeader}>
              <SectionRule
                title={
                  activeCategory
                    ? `${activeCategory.name} desk`
                    : "Section feed"
                }
                cta="Full section page"
                onPressCta={() =>
                  router.push(`/category/${encodeURIComponent(selectedSlug)}`)
                }
              />
            </View>

            {/* Show NEPSE Board automatically when NEPSE desk is selected */}
            {selectedSlug === "nepse" &&
            showTools !== "nepse" &&
            nepseQuery.data ? (
              <View style={styles.nepseInline}>
                <NepseBoard snapshot={nepseQuery.data} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          articlesQuery.isLoading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={palette.ink} />
            </View>
          ) : (
            <EmptyState
              kicker={
                activeCategory?.is_locked
                  ? "Section · Restricted"
                  : "No dispatches"
              }
              title={
                activeCategory?.is_locked
                  ? "Awaiting editorial release."
                  : `No stories in ${activeCategory?.name ?? selectedSlug} yet`
              }
              description={
                activeCategory?.description ??
                "Select another desk above or search our full archive."
              }
              actionLabel="Open section page"
              onAction={() =>
                router.push(`/category/${encodeURIComponent(selectedSlug)}`)
              }
            />
          )
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.storyRow,
              index > 0 && {
                borderTopWidth: 1,
                borderTopColor: palette.rule,
              },
            ]}
          >
            <ArticleCard article={item} />
          </View>
        )}
        ListFooterComponent={
          articlesQuery.isFetchingNextPage ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={palette.ink} />
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.gutter,
    paddingBottom: 40,
  },
  headerContainer: {
    paddingTop: 18,
  },
  heroHeader: {
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -0.6,
    marginTop: 6,
  },
  searchLauncher: {
    marginTop: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchPlaceholder: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15.5,
  },
  desksSection: {
    marginTop: 24,
  },
  desksGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderLeftWidth: 1,
  },
  deskCell: {
    width: "50%",
    padding: 12,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  deskTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  deskName: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  deskDesc: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 5,
  },
  toolsSection: {
    marginTop: 20,
  },
  toolsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  toolButton: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  toolButtonText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  toolPanel: {
    marginTop: 14,
  },
  tagsSection: {
    marginTop: 24,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
  },
  feedHeader: {
    marginTop: 28,
  },
  nepseInline: {
    marginBottom: 20,
  },
  storyRow: {
    paddingVertical: 18,
  },
  loaderWrap: {
    paddingVertical: 28,
    alignItems: "center",
  },
});
