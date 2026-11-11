import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import { onHomeDoubleTap } from "@/features/home/homeTabEvents";
import { feedCardImageUrls } from "@/utils/images";
import {
  useHomeFeed,
  useInfiniteLatestArticles,
} from "@/features/articles/useArticles";
import { useTheme } from "@/hooks/useTheme";
import type { ArticleCard } from "@/types/domain";

import { AppHeader } from "@/components/AppHeader";
import { FeedCard, FeedCardSkeleton } from "@/components/FeedCard";
import { EmptyState } from "@/components/EmptyState";
import { CachedNoticeBanner, ErrorState } from "@/components/ErrorState";

/**
 * Home (`/`): a vertical feed of full-screen stories, one per swipe, like a
 * reel. The editors' lead story comes first, then every other story newest
 * first, loading more as the reader nears the end. Every story appears once.
 *
 * Each page is exactly as tall as the space between the header and the tab
 * bar (measured, since the mini room bar or a notice can take some of it),
 * which is what lets the list snap one story at a time.
 */

const WIRE_PAGE = 12;

/** A card counts as "on screen" once most of it is showing. */
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

export default function HomeScreen() {
  const { palette } = useTheme();

  /* The visible feed height; every page is this tall. */
  const [pageHeight, setPageHeight] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setPageHeight((prev) => (prev === h ? prev : h));
  }, []);

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

  /* Double-tap the Home tab: back to the top story, then refresh. */
  const listRef = useRef<FlatList<ArticleCard>>(null);
  useEffect(
    () =>
      onHomeDoubleTap(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
        refresh();
      }),
    [refresh],
  );

  /*
   * Fetch the next two stories' photos while the reader is on this one, so a
   * swipe lands on a finished page instead of a blank frame. expo-image keeps
   * them in its memory and disk cache, which FeedCard reads from.
   */
  const storiesRef = useRef(stories);
  useEffect(() => {
    storiesRef.current = stories;
  }, [stories]);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
      const index = viewableItems[0]?.index;
      if (typeof index !== "number") return;
      const next = storiesRef.current.slice(index + 1, index + 3);
      const urls = next.flatMap((a) => feedCardImageUrls(a.hero_image));
      if (urls.length) void Image.prefetch(urls, "memory-disk").catch(() => undefined);
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (wire.hasNextPage && !wire.isFetchingNextPage) void wire.fetchNextPage();
  }, [wire]);

  const renderItem = useCallback(
    ({ item }: { item: ArticleCard }) => (
      <FeedCard article={item} height={pageHeight} />
    ),
    [pageHeight],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight],
  );

  const screen = [styles.screen, { backgroundColor: palette.paper }];

  if (isLoading && stories.length === 0) {
    return (
      <View style={screen}>
        <AppHeader showSectionBar={false} />
        <View style={styles.fill} onLayout={onLayout}>
          {pageHeight > 0 ? <FeedCardSkeleton height={pageHeight} /> : null}
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

      {isError ? (
        <CachedNoticeBanner updatedAt={dataUpdatedAt} onRetry={refresh} />
      ) : null}

      <View style={styles.fill} onLayout={onLayout}>
        {pageHeight > 0 ? (
          <FlatList
            ref={listRef}
            data={stories}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={VIEWABILITY}
            keyExtractor={(item) => item.slug}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            pagingEnabled
            snapToInterval={pageHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            showsVerticalScrollIndicator={false}
            initialNumToRender={2}
            maxToRenderPerBatch={3}
            windowSize={5}
            removeClippedSubviews
            onEndReached={loadMore}
            onEndReachedThreshold={3}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refresh}
                tintColor={palette.ink}
              />
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
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
});
