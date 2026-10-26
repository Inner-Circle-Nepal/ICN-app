import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  useEditionArticles,
  useHomeFeed,
  useInfiniteLatestArticles,
} from "@/features/articles/useArticles";
import { useTheme } from "@/hooks/useTheme";
import { editions, hasMultipleEditions, site } from "@/constants/site";
import { fontFamilies, spacing } from "@/theme/tokens";
import { clockIn, formatDate } from "@/utils/format";
import type {
  ArticleCard as ArticleCardType,
  Edition,
  HomeFeedData,
} from "@/types/domain";

import { AppHeader } from "@/components/AppHeader";
import { FeaturedStory } from "@/components/FeaturedStory";
import { ArticleCard } from "@/components/ArticleCard";
import { ArticleListItem } from "@/components/ArticleListItem";
import { SectionRule } from "@/components/SectionRule";
import { NepseStrip } from "@/components/NepseStrip";
import { ForexWidget } from "@/components/ForexWidget";
import { NewsletterBox } from "@/components/NewsletterBox";
import { HomeLoadingSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { CachedNoticeBanner, ErrorState } from "@/components/ErrorState";

/**
 * Editorial Homepage (`/`).
 *
 * Translates `site/src/app/(site)/page.tsx` into a native mobile broadsheet:
 *   - Masthead & horizontally scrolling section strip
 *   - Kathmandu dateline & live clock
 *   - Lead story (`FeaturedStory`) + supporting lead stories
 *   - "Also leading" curated rail
 *   - Chosen Diaspora Edition band (when stories are tagged to the edition)
 *   - "Latest" wire grid & briefs + "Load more from the wire" infinite paging
 *   - "Visas & immigration" section rail
 *   - "Most read" numbered ranking (01–05)
 *   - NEPSE Index strip & "Send home" Remittance Converter
 *   - "Six continents. One newsroom." Newsletter band
 *   - "Investigations" panel (locked teaser or live stories)
 */

export default function HomeScreen() {
  const router = useRouter();
  const { palette, editionSlug } = useTheme();

  const {
    data: feed,
    isLoading,
    isRefetching,
    isError,
    refetch,
    dataUpdatedAt,
  } = useHomeFeed();

  const wireQuery = useInfiniteLatestArticles(12);
  const editionQuery = useEditionArticles(editionSlug, 3);

  const handleRefresh = useCallback(() => {
    void refetch();
    void wireQuery.refetch();
    void editionQuery.refetch();
  }, [refetch, wireQuery, editionQuery]);

  // Additional wire stories loaded beyond the initial homepage feed
  const extraWireStories = useMemo(() => {
    if (!feed || !wireQuery.data) return [];
    const shownSlugs = new Set<string>();
    if (feed.lead) shownSlugs.add(feed.lead.slug);
    for (const a of feed.secondLead) shownSlugs.add(a.slug);
    for (const a of feed.alsoLeading) shownSlugs.add(a.slug);
    for (const a of feed.latestGrid) shownSlugs.add(a.slug);
    for (const a of feed.latestBriefs) shownSlugs.add(a.slug);

    return wireQuery.data.pages
      .flat()
      .filter((a) => !shownSlugs.has(a.slug));
  }, [feed, wireQuery.data]);

  /*
   * The dateline clock ticks. It was computed once at mount, so a reader who
   * left the app open saw a Kathmandu time that was quietly hours wrong.
   * Aligned to the start of the next minute so it changes when the minute
   * does, rather than drifting by however long after launch it happened to be.
   */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  const kathmanduDate = useMemo(
    () => formatDate(now, "Asia/Kathmandu"),
    [now],
  );
  const kathmanduTime = useMemo(
    () => clockIn("Asia/Kathmandu", now),
    [now],
  );

  const activeEdition = useMemo(
    () => editions.find((e) => e.slug === editionSlug) ?? editions[0],
    [editionSlug],
  );

  if (isLoading && !feed) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper }]}>
        <AppHeader showSectionBar={false} />
        <ScrollView>
          <HomeLoadingSkeleton />
        </ScrollView>
      </View>
    );
  }

  if (isError && !feed) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper }]}>
        <AppHeader showSectionBar={false} />
        <ErrorState
          title="The front page couldn’t be reached"
          message="We couldn’t connect to the Inner Circle Nepal newsroom. Check your internet connection and try again."
          onRetry={handleRefresh}
        />
      </View>
    );
  }

  if (!feed || (!feed.lead && feed.latestGrid.length === 0)) {
    return (
      <View style={[styles.screen, { backgroundColor: palette.paper }]}>
        <AppHeader categories={feed?.categories ?? []} />
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={palette.ink}
            />
          }
        >
          <EmptyState
            kicker="Inner Circle Nepal"
            title="The presses haven’t rolled yet."
            description="No stories have been published. Once the newsroom files its first piece it will appear here."
            actionLabel="Refresh edition"
            onAction={handleRefresh}
          />
        </ScrollView>
      </View>
    );
  }

  // The sections below the wire read their own slices of `feed` in
  // HomeFooterSections; only what the header renders is pulled out here.
  const {
    lead,
    secondLead,
    alsoLeading,
    latestGrid,
    latestBriefs,
    categories,
    nepseReading,
  } = feed;

  const editionStories = (editionQuery.data ?? []).filter(
    (a) => a.slug !== lead?.slug,
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <AppHeader categories={categories} />

      {isError && feed ? (
        <CachedNoticeBanner updatedAt={dataUpdatedAt} onRetry={handleRefresh} />
      ) : null}

      {/*
        The front page is a FlatList rather than a ScrollView because the wire
        grows without bound: every "Load more" appends another twelve stories,
        each with a photograph, and a ScrollView keeps all of them mounted.
        The curated top of the page is fixed in length, so it stays in the
        header; only the wire — the part that grows — is virtualised.
      */}
      <FlatList
        data={extraWireStories}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={styles.scrollContent}
        windowSize={7}
        initialNumToRender={6}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={palette.ink}
          />
        }
        renderItem={({ item, index }) => (
          <View style={styles.wireRow}>
            <ArticleListItem
              article={item}
              variant="compact"
              showTopRule={index > 0}
              style={index > 0 ? styles.mt18 : undefined}
            />
          </View>
        )}
        ListFooterComponent={
          <HomeFooterSections
            feed={feed}
            wireQuery={wireQuery}
            editionStories={editionStories}
            activeEdition={activeEdition}
          />
        }
        ListHeaderComponent={
          <>
          {/* -------------------------------------------------------- Dateline */}
          <View
            style={[
              styles.datelineBar,
              { borderBottomColor: palette.rule },
            ]}
          >
            <Text style={[styles.datelineText, { color: palette.quiet }]}>
              {kathmanduDate} · {kathmanduTime} NPT · Kathmandu
            </Text>
            <Text style={[styles.taglineText, { color: palette.quiet }]}>
              {site.tagline}
            </Text>
          </View>

          {/* ------------------------------------------------------ Lead story */}
          <View style={styles.sectionBlock}>
            {lead ? <FeaturedStory article={lead} /> : null}

            {secondLead.length > 0 ? (
              <View
                style={[
                  styles.secondLeadContainer,
                  { borderTopColor: palette.ink },
                ]}
              >
                {secondLead.map((story, idx) => (
                  <ArticleListItem
                    key={story.slug}
                    article={story}
                    variant="top"
                    showTopRule={idx > 0}
                    style={idx > 0 ? styles.mt18 : undefined}
                  />
                ))}
              </View>
            ) : null}
          </View>

          {/* ---------------------------------------------------- Also leading */}
          {alsoLeading.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionRule title="Also leading" />
              {alsoLeading.map((story, idx) => (
                <ArticleListItem
                  key={story.slug}
                  article={story}
                  variant="compact"
                  showTopRule={idx > 0}
                  style={idx > 0 ? styles.mt18 : undefined}
                />
              ))}
            </View>
          ) : null}

          {/* ---------------------------------------------- Market & FX strip */}
          {nepseReading.index ? (
            <View style={styles.horizontalPadding}>
              <NepseStrip reading={nepseReading} />
            </View>
          ) : null}

          {/* ----------------------------------------------------- Latest wire */}
          {latestGrid.length > 0 ? (
            <View style={styles.sectionBlock}>
              <SectionRule
                title="Latest"
                cta="All stories"
                onPressCta={() => router.push("/explore")}
              />

              {latestGrid.map((story, idx) => (
                <View
                  key={story.slug}
                  style={[
                    idx > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.rule,
                      paddingTop: 22,
                      marginTop: 22,
                    },
                  ]}
                >
                  <ArticleCard article={story} />
                </View>
              ))}

              {latestBriefs.length > 0 ? (
                <View
                  style={[
                    styles.briefsBlock,
                    { borderTopColor: palette.rule },
                  ]}
                >
                  {latestBriefs.map((story, idx) => (
                    <ArticleListItem
                      key={story.slug}
                      article={story}
                      variant="brief"
                      showTopRule={idx > 0}
                      style={idx > 0 ? styles.mt16 : undefined}
                    />
                  ))}
                </View>
              ) : null}

              {extraWireStories.length > 0 ? (
                <View
                  style={[
                    styles.wireDivider,
                    { borderTopColor: palette.rule },
                  ]}
                />
              ) : null}
            </View>
          ) : null}
          </>
        }
      />
    </View>
  );
}

/**
 * Everything below the wire: the sections that close the front page.
 *
 * Split out so the FlatList can render it as a footer after the paginated
 * wire stories, keeping the page in the same order it reads on the website.
 */
function HomeFooterSections({
  feed,
  wireQuery,
  editionStories,
  activeEdition,
}: {
  feed: HomeFeedData;
  wireQuery: ReturnType<typeof useInfiniteLatestArticles>;
  editionStories: ArticleCardType[];
  activeEdition: Edition | undefined;
}) {
  const router = useRouter();
  const { palette } = useTheme();
  const {
    immigration,
    trending,
    investigationsCategory,
    investigationStories,
    forexRates,
  } = feed;

  return (
    <View>
      {wireQuery.hasNextPage ? (
        <View style={styles.horizontalPaddingTight}>
          <Pressable
            onPress={() => void wireQuery.fetchNextPage()}
            disabled={wireQuery.isFetchingNextPage}
            accessibilityRole="button"
            accessibilityState={{ disabled: wireQuery.isFetchingNextPage }}
            accessibilityLabel="Load more stories from the wire"
            style={({ pressed }) => [
              styles.loadMoreBtn,
              { borderColor: palette.rule2 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.loadMoreText, { color: palette.ink }]}>
              {wireQuery.isFetchingNextPage
                ? "Loading more stories…"
                : "Load more from the wire"}
            </Text>
          </Pressable>
        </View>
      ) : null}

        {/* -------------------------------------------- Visas & Immigration */}
        {immigration.length > 0 ? (
          <View style={styles.sectionBlock}>
            <SectionRule
              title="Visas & immigration"
              cta="All immigration"
              onPressCta={() => router.push("/category/immigration")}
            />
            <Text style={[styles.sectionDeck, { color: palette.quiet }]}>
              Rule changes across the US, UK, Australia, Canada and the Gulf — read before they reach your inbox, explained without the jargon.
            </Text>

            {immigration.map((story, idx) => (
              <ArticleListItem
                key={story.slug}
                article={story}
                variant="top"
                showTopRule={idx > 0}
                style={idx > 0 ? styles.mt18 : undefined}
              />
            ))}
          </View>
        ) : null}

        {/* ------------------------------------------------------- Most Read */}
        {trending.length > 0 ? (
          <View style={styles.sectionBlock}>
            <SectionRule title="Most read" />
            {trending.map((story, idx) => (
              <ArticleListItem
                key={story.slug}
                article={story}
                variant="numbered"
                index={idx}
                showTopRule={idx > 0}
                style={idx > 0 ? styles.mt16 : undefined}
              />
            ))}
          </View>
        ) : null}

        {/* ------------------------------------------------- Remittance rail */}
        {forexRates.length > 0 ? (
          <View style={styles.sectionBlock}>
            <ForexWidget
              rates={forexRates}
              defaultCode={activeEdition?.currency ?? "USD"}
            />
          </View>
        ) : null}

        {/* ------------------------------------------------- Newsletter band */}
        <View style={styles.newsletterSpacing}>
          <NewsletterBox source="mobile-home" />
        </View>

        {/* -------------------------------------------------- Investigations */}
        {investigationsCategory?.is_locked && investigationStories.length === 0 ? (
          <View
            style={[
              styles.sectionBlock,
              styles.investigationsLocked,
              { borderTopColor: palette.ink },
            ]}
          >
            <Text style={[styles.lockedKicker, { color: palette.red }]}>
              Investigations · in preparation
            </Text>
            <Text style={[styles.lockedTitle, { color: palette.ink }]}>
              The first one is being verified.
            </Text>
            <Text style={[styles.lockedBlurb, { color: palette.quiet }]}>
              {investigationsCategory.locked_blurb}
            </Text>
            <Pressable
              onPress={() => router.push("/category/investigations")}
              accessibilityRole="link"
              style={styles.lockedLinkBtn}
            >
              <Text style={[styles.lockedLinkText, { color: palette.ink }]}>
                What we will publish, and when â†’
              </Text>
            </Pressable>
          </View>
        ) : investigationStories.length > 0 ? (
          <View style={styles.sectionBlock}>
            <SectionRule
              title="Investigations"
              cta="All investigations"
              onPressCta={() => router.push("/category/investigations")}
            />
            {investigationStories.map((story, idx) => (
              <ArticleListItem
                key={story.slug}
                article={story}
                variant="top"
                showTopRule={idx > 0}
                style={idx > 0 ? styles.mt18 : undefined}
              />
            ))}
          </View>
        ) : null}

        {/* ------------------------------------------------- Diaspora Edition */}
        {activeEdition ? (
          <View
            style={[
              styles.sectionBlock,
              styles.editionFooter,
              { borderTopColor: palette.rule },
            ]}
          >
            <Text style={[styles.editionKicker, { color: palette.ink }]}>
              {hasMultipleEditions ? "Editions" : activeEdition.name}
            </Text>
            <Text style={[styles.editionSub, { color: palette.quiet }]}>
              {hasMultipleEditions
                ? "Read the news through the lens of where you are."
                : "Visa rules, community reporting and remittance rates for Nepalis in America."}
            </Text>

            {editionStories.length > 0 ? (
              <View style={styles.mt16}>
                {editionStories.map((story, idx) => (
                  <ArticleListItem
                    key={story.slug}
                    article={story}
                    variant="brief"
                    showTopRule={idx > 0}
                    style={idx > 0 ? styles.mt16 : undefined}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  wireRow: {
    paddingHorizontal: spacing.gutter,
  },
  wireDivider: {
    borderTopWidth: 1,
    marginTop: 22,
  },
  horizontalPaddingTight: {
    paddingHorizontal: spacing.gutter,
  },
  datelineBar: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginHorizontal: spacing.gutter,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  datelineText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
  },
  taglineText: {
    fontFamily: fontFamilies.serifItalic,
    fontSize: 12,
    fontStyle: "italic",
  },
  sectionBlock: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 26,
  },
  horizontalPadding: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 22,
  },
  secondLeadContainer: {
    borderTopWidth: 1,
    marginTop: 24,
    paddingTop: 20,
  },
  briefsBlock: {
    borderTopWidth: 1,
    marginTop: 22,
    paddingTop: 18,
  },
  sectionDeck: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 18,
  },
  loadMoreBtn: {
    marginTop: 24,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  newsletterSpacing: {
    marginTop: 32,
  },
  investigationsLocked: {
    borderTopWidth: 1,
    marginTop: 28,
    paddingTop: 24,
  },
  lockedKicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  lockedTitle: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 28,
    lineHeight: 32,
    marginTop: 10,
  },
  lockedBlurb: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 12,
  },
  lockedLinkBtn: {
    marginTop: 16,
    paddingVertical: 4,
  },
  lockedLinkText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  editionFooter: {
    borderTopWidth: 1,
    marginTop: 28,
    paddingTop: 20,
  },
  editionKicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  editionSub: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 6,
  },
  mt16: {
    marginTop: 16,
  },
  mt18: {
    marginTop: 18,
  },
  pressed: {
    opacity: 0.75,
  },
});
