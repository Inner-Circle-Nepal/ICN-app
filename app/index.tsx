import React, { useCallback, useMemo } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import {
  useHomeFeed,
  useInfiniteLatestArticles,
} from "@/features/articles/useArticles";
import { useTheme } from "@/hooks/useTheme";
import type { ArticleCard } from "@/types/domain";

import { AppHeader } from "@/components/AppHeader";
import { FEED_GUTTER, FeedCard, FeedCardSkeleton } from "@/components/FeedCard";
import { EmptyState } from "@/components/EmptyState";
import { CachedNoticeBanner, ErrorState } from "@/components/ErrorState";

/**
 * Home (`/`): one scrolling feed of photo cards, newest first.
 *
 * The editors' lead story comes first, then every other story newest first,
 * loading more as the reader scrolls. Every story appears once. Sections, markets and the newsletter
 * live in Explore and Settings, so the front page is only stories.
 */

const WIRE_PAGE = 12;
const SKELETONS = [0, 1, 2];

export default function HomeScreen() {
  const { palette } = useTheme();

  const {
    data: feed,
    isLoading,
    isRefetching,
    isError,
    refetch,
    dataUpdatedAt,
  } = useHomeFeed();
  const wire = useInfiniteLatestArticles(WIRE_PAGE);

  /*
   * The editors' lead story first, then everything else newest first, like
   * any feed. (Featured stories can be days old; in a broadsheet rail that
   * reads fine, in a scrolling feed a "5d ago" above a "7h ago" does not.)
   */
  const stories = useMemo<ArticleCard[]>(() => {
    const lead = feed?.lead ?? null;
    const seen = new Set<string>(lead ? [lead.slug] : []);
    const rest = [
      ...(feed?.alsoLeading ?? []),
      ...(feed?.latest ?? []),
      ...(wire.data?.pages.flat() ?? []),
    ]
      .filter((a) => (seen.has(a.slug) ? false : (seen.add(a.slug), true)))
      .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
    return lead ? [lead, ...rest] : rest;
  }, [feed, wire.data]);

  const refresh = useCallback(() => {
    void refetch();
    void wire.refetch();
  }, [refetch, wire]);

  const loadMore = useCallback(() => {
    if (wire.hasNextPage && !wire.isFetchingNextPage) void wire.fetchNextPage();
  }, [wire]);

  const renderItem = useCallback(
    ({ item }: { item: ArticleCard }) => <FeedCard article={item} />,
    [],
  );

  const screen = [styles.screen, { backgroundColor: palette.paper }];

  if (isLoading && stories.length === 0) {
    return (
      <View style={screen}>
        <AppHeader showSectionBar={false} />
        <View style={styles.list}>
          {SKELETONS.map((k) => (
            <FeedCardSkeleton key={k} />
          ))}
        </View>
      </View>
    );
  }

  if (isError && stories.length === 0) {
    return (
      <View style={screen}>
        <AppHeader showSectionBar={false} />
        <ErrorState
          title="The front page couldn’t be reached"
          message="We couldn’t connect to the Inner Circle Nepal newsroom. Check your internet connection and try again."
          onRetry={refresh}
        />
      </View>
    );
  }

  return (
    <View style={screen}>
      <AppHeader showSectionBar={false} />

      {isError ? <CachedNoticeBanner updatedAt={dataUpdatedAt} onRetry={refresh} /> : null}

      <FlatList
        data={stories}
        keyExtractor={(item) => item.slug}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refresh} tintColor={palette.ink} />
        }
        ListEmptyComponent={
          <EmptyState
            kicker="Inner Circle Nepal"
            title="The presses haven’t rolled yet."
            description="No stories have been published. Once the newsroom files its first piece it will appear here."
            actionLabel="Refresh"
            onAction={refresh}
          />
        }
        ListFooterComponent={
          wire.isFetchingNextPage ? (
            <ActivityIndicator style={styles.more} color={palette.quiet} />
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingTop: FEED_GUTTER, paddingBottom: FEED_GUTTER * 2 },
  more: { paddingVertical: 20 },
});
