import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Path, Rect } from "react-native-svg";

import {
  useCategories,
  useCategoryBySlug,
  useCategoryCount,
  useInfiniteCategoryArticles,
} from "@/features/categories/useCategories";
import { useNepseSnapshot } from "@/features/market/useMarket";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { site } from "@/constants/site";
import { AppHeader } from "@/components/AppHeader";
import { FeaturedStory } from "@/components/FeaturedStory";
import { ArticleCard } from "@/components/ArticleCard";
import { NepseBoard } from "@/components/NepseBoard";
import { SectionRule } from "@/components/SectionRule";
import { HomeLoadingSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import type { ArticleCard as ArticleCardType } from "@/types/domain";

/**
 * Category / Section Screen (`app/category/[slug].tsx`).
 *
 * Mirrors `site/src/app/(site)/[category]/page.tsx`:
 *   - Section header with total story count and description
 *   - Restricted / Locked Section view when `category.is_locked` and empty
 *   - Full `NepseBoard` market overview when `slug === "nepse"`
 *   - Section lead story (`FeaturedStory`) + infinite paginated story feed
 */
export default function CategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const rawSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const slug = rawSlug ? decodeURIComponent(rawSlug) : "nepal";

  const { palette, language } = useTheme();
  const categoriesQuery = useCategories();
  const categoryQuery = useCategoryBySlug(slug);
  const countQuery = useCategoryCount(slug);
  const articlesQuery = useInfiniteCategoryArticles(slug);
  const nepseQuery = useNepseSnapshot(slug === "nepse");

  const category =
    categoryQuery.data ??
    categoriesQuery.data?.find((c) => c.slug === slug) ??
    null;

  const allArticles = useMemo<ArticleCardType[]>(() => {
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

  const leadArticle = allArticles[0] ?? null;
  const remainingArticles = useMemo(
    () => allArticles.slice(1),
    [allArticles],
  );

  const isRefreshing =
    articlesQuery.isRefetching && !articlesQuery.isFetchingNextPage;

  const handleRefresh = async () => {
    await Promise.all([
      categoryQuery.refetch(),
      countQuery.refetch(),
      articlesQuery.refetch(),
      slug === "nepse" ? nepseQuery.refetch() : Promise.resolve(),
    ]);
  };

  const totalCount = countQuery.data ?? allArticles.length;

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <AppHeader
        categories={categoriesQuery.data ?? []}
        activeCategorySlug={slug}
      />

      {articlesQuery.isLoading && allArticles.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={<HomeLoadingSkeleton />}
        />
      ) : articlesQuery.isError && allArticles.length === 0 ? (
        <View style={styles.centeredWrap}>
          <ErrorState
            title="Unable to load this section"
            message="Please check your connection and try again."
            onRetry={() => void handleRefresh()}
          />
        </View>
      ) : category?.is_locked && allArticles.length === 0 ? (
        <LockedCategoryView
          name={
            language === "ne" && category.name_ne
              ? category.name_ne
              : category.name
          }
          description={category.description}
          onReturnHome={() => router.replace("/")}
        />
      ) : (
        <FlatList
          data={remainingArticles}
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
            if (
              articlesQuery.hasNextPage &&
              !articlesQuery.isFetchingNextPage
            ) {
              void articlesQuery.fetchNextPage();
            }
          }}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              {/* Section Header */}
              <View
                style={[
                  styles.sectionHeader,
                  { borderBottomColor: palette.ink },
                ]}
              >
                <Text style={[styles.kicker, { color: palette.quiet }]}>
                  Section · {totalCount}{" "}
                  {totalCount === 1 ? "story" : "stories"}
                </Text>
                <Text style={[styles.sectionTitle, { color: palette.ink }]}>
                  {category
                    ? language === "ne" && category.name_ne
                      ? category.name_ne
                      : category.name
                    : slug}
                </Text>
                {category?.description ? (
                  <Text
                    style={[styles.sectionDesc, { color: palette.quiet }]}
                  >
                    {category.description}
                  </Text>
                ) : null}
              </View>

              {/* NEPSE Live Market Board when on /category/nepse */}
              {slug === "nepse" && nepseQuery.data ? (
                <View style={styles.nepseBoardWrap}>
                  <NepseBoard snapshot={nepseQuery.data} />
                </View>
              ) : null}

              {/* Lead Story */}
              {leadArticle ? (
                <View
                  style={[
                    styles.leadWrap,
                    { borderBottomColor: palette.rule },
                  ]}
                >
                  <FeaturedStory article={leadArticle} />
                </View>
              ) : (
                <EmptyState
                  kicker="No stories yet"
                  title={`No stories published in ${category?.name ?? slug} yet`}
                  description="New dispatches will appear here as our newsroom files them."
                  actionLabel="Back to Front Page"
                  onAction={() => router.replace("/")}
                />
              )}

              {remainingArticles.length > 0 ? (
                <View style={styles.moreHeaderWrap}>
                  <SectionRule
                    title={`All ${category?.name ?? slug} dispatches`}
                    cta={`Page ${articlesQuery.data?.pages.length ?? 1}`}
                  />
                </View>
              ) : null}
            </View>
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
              <View style={styles.footerLoader}>
                <ActivityIndicator color={palette.ink} />
              </View>
            ) : articlesQuery.hasNextPage ? (
              <Pressable
                onPress={() => void articlesQuery.fetchNextPage()}
                style={[styles.loadMoreBtn, { borderColor: palette.ink }]}
              >
                <Text style={[styles.loadMoreText, { color: palette.ink }]}>
                  Load older dispatches →
                </Text>
              </Pressable>
            ) : allArticles.length > 0 ? (
              <Text style={[styles.endText, { color: palette.quiet }]}>
                End of {category?.name ?? slug} archive · {allArticles.length}{" "}
                stories loaded
              </Text>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

function LockedCategoryView({
  name,
  description,
  onReturnHome,
}: {
  name: string;
  description?: string | null;
  onReturnHome: () => void;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.lockedOuter}>
      <View
        style={[
          styles.lockedHeader,
          { borderBottomColor: palette.ink },
        ]}
      >
        <View style={styles.lockedKickerRow}>
          <Text style={[styles.kicker, { color: palette.quiet }]}>
            Section · Restricted
          </Text>
          <View
            style={[
              styles.lockedBadge,
              {
                borderColor: palette.rule2,
                backgroundColor: palette.paper2,
              },
            ]}
          >
            <Svg width={10} height={10} viewBox="0 0 12 12" fill="none">
              <Rect
                x={2}
                y={5.5}
                width={8}
                height={5.5}
                rx={1}
                stroke={palette.ink}
                strokeWidth={1.2}
              />
              <Path
                d="M3.8 5.5V3.8a2.2 2.2 0 0 1 4.4 0v1.7"
                stroke={palette.ink}
                strokeWidth={1.2}
              />
            </Svg>
            <Text style={[styles.lockedBadgeText, { color: palette.ink }]}>
              Locked
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: palette.ink }]}>
          {name}
        </Text>
        {description ? (
          <Text style={[styles.sectionDesc, { color: palette.quiet }]}>
            {description}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.lockedBox,
          {
            borderColor: palette.rule2,
            backgroundColor: palette.paper2,
          },
        ]}
      >
        <Text style={[styles.kicker, { color: palette.quiet }]}>
          Desk status · Sealed until publication
        </Text>
        <Text style={[styles.lockedHeadline, { color: palette.ink }]}>
          Awaiting editorial release.
        </Text>
        <Text style={[styles.lockedCopy, { color: palette.quiet }]}>
          Our long-form investigations desk is verifying documents, right-of-reply
          responses, and legal review before anything appears on this page. The
          section unlocks automatically the moment our first dossier clears the
          newsroom.
        </Text>

        <View
          style={[
            styles.lockedFooter,
            { borderTopColor: palette.rule },
          ]}
        >
          <Text style={[styles.lockedMeta, { color: palette.quiet }]}>
            Have documents or a lead for the desk? Write to{" "}
            <Text
              style={[styles.lockedLink, { color: palette.ink }]}
              onPress={() =>
                void Linking.openURL(`mailto:${site.tipsEmail}`).catch(() => {})
              }
            >
              {site.tipsEmail}
            </Text>
            .
          </Text>

          <Pressable onPress={onReturnHome} hitSlop={8}>
            <Text style={[styles.lockedAction, { color: palette.ink }]}>
              Return to front page →
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centeredWrap: {
    flex: 1,
    paddingHorizontal: spacing.gutter,
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: spacing.gutter,
    paddingBottom: 40,
  },
  headerBlock: {
    paddingTop: 18,
  },
  sectionHeader: {
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
  sectionTitle: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.7,
    marginTop: 8,
  },
  sectionDesc: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 16.5,
    lineHeight: 24,
    marginTop: 8,
  },
  nepseBoardWrap: {
    marginTop: 22,
  },
  leadWrap: {
    paddingVertical: 24,
    borderBottomWidth: 1,
  },
  moreHeaderWrap: {
    marginTop: 26,
  },
  storyRow: {
    paddingVertical: 18,
  },
  footerLoader: {
    paddingVertical: 24,
    alignItems: "center",
  },
  loadMoreBtn: {
    marginTop: 12,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: "center",
  },
  loadMoreText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  endText: {
    marginTop: 18,
    textAlign: "center",
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  lockedOuter: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 18,
  },
  lockedHeader: {
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  lockedKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  lockedBadgeText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  lockedBox: {
    marginTop: 24,
    borderWidth: 1,
    padding: 20,
  },
  lockedHeadline: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 28,
    lineHeight: 33,
    marginTop: 10,
  },
  lockedCopy: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  lockedFooter: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  lockedMeta: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 18,
  },
  lockedLink: {
    textDecorationLine: "underline",
  },
  lockedAction: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
});
