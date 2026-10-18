import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { useArticleDetail } from "@/features/articles/useArticles";
import { useNarration } from "@/features/audio/useNarration";
import { narrationTextFromHtml } from "@/utils/narration";
import { ListenBar } from "@/components/ListenBar";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { IMAGE_WIDTHS, sizedImageUrl } from "@/utils/images";
import { editions, site } from "@/constants/site";
import { ArticleBylineBand, AuthorBioCard } from "@/components/AuthorMetadata";
import { ShareBar } from "@/components/ShareBar";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ArticleContent } from "@/components/ArticleContent";
import { SectionRule } from "@/components/SectionRule";
import { ArticleCard } from "@/components/ArticleCard";
import { NewsletterBox } from "@/components/NewsletterBox";
import { ArticleLoadingSkeleton } from "@/components/LoadingSkeleton";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

/**
 * Long-form Article Reading Screen (`app/article/[slug].tsx`).
 *
 * Mirrors `site/src/app/(site)/[category]/[slug]/page.tsx`:
 *   - Reading progress bar (2px `#db0a12` red accent line)
 *   - Bilingual toggle (`English` / `नेपाली`) when Nepali translation fields exist
 *   - Category kicker + Investigation tag
 *   - Display serif headline & standfirst
 *   - Rule-bounded byline band (author, role, location, NPT timestamp, reading time)
 *   - Share & Save bar (native share sheet with canonical URL)
 *   - Hero photograph (`16:10`) + caption
 *   - Full native HTML body renderer (`ArticleContent`)
 *   - Topics / tags strip + Editions strip
 *   - Reporter bio card + Corrections notice + Newsletter + Related reading
 */
export default function ArticleDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const rawSlug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const slug = rawSlug ? decodeURIComponent(rawSlug) : "";

  const { palette, language, setLanguage } = useTheme();
  const {
    article,
    related,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useArticleDetail(slug);

  const [heroImageFailed, setHeroImageFailed] = useState(false);

  /**
   * Reading progress, driven on the UI thread.
   *
   * This was a `useState` updated from `onScroll` at 16ms, which re-rendered
   * the whole screen — headline, byline, every paragraph of the body, related
   * stories — sixty times a second while the reader scrolled. A long story is
   * several hundred `Text` nodes, and on a mid-range Android that is the
   * difference between a smooth scroll and a visibly stuttering one.
   *
   * The offset now feeds an `Animated.Value` through the native driver, so
   * scrolling costs no React render at all. Only the two measurements below
   * change by `setState`, and they settle once the layout and images do.
   */
  // `useState` with a lazy initialiser, not `useRef(...).current`: the value
  // must be created once and must not be read from a ref during render.
  const [scrollY] = useState(() => new Animated.Value(0));
  const [barWidth, setBarWidth] = useState(0);
  const [scrollable, setScrollable] = useState(0);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);

  const syncScrollable = useCallback(() => {
    const next = Math.max(0, contentHeight.current - viewportHeight.current);
    setScrollable((prev) => (Math.abs(prev - next) > 1 ? next : prev));
  }, []);

  const progressTranslate = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, Math.max(1, scrollable)],
        outputRange: [-barWidth, 0],
        extrapolate: "clamp",
      }),
    [scrollY, scrollable, barWidth],
  );

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const hasNepaliTranslation = Boolean(
    article && (article.title_ne || article.excerpt_ne || article.body_ne),
  );
  const showNepali = Boolean(language === "ne" && hasNepaliTranslation);

  const displayTitle =
    showNepali && article?.title_ne ? article.title_ne : article?.title ?? "";
  const displayStandfirst =
    showNepali && article?.excerpt_ne
      ? article.excerpt_ne
      : article?.excerpt || "";
  const displayBody =
    showNepali && article?.body_ne ? article.body_ne : article?.body ?? "";
  const isBodyNepali = Boolean(showNepali && article?.body_ne);

  /*
   * Narration text comes from the parsed blocks, not the raw HTML, so the
   * engine never reads tag soup aloud. Memoised on the body because
   * re-parsing a long article on every render would be the most expensive
   * thing on this screen.
   */
  const narrationText = useMemo(
    () => (displayBody ? narrationTextFromHtml(displayBody) : ""),
    [displayBody],
  );
  const narration = useNarration(narrationText, isBodyNepali ? "ne" : "en");

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      {/* Top Reading Bar */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: palette.paper,
            borderBottomColor: palette.rule,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={12}
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
          <Text style={[styles.backLabel, { color: palette.ink }]}>Back</Text>
        </Pressable>

        {article ? (
          <View style={styles.topRightActions}>
            <Pressable
              onPress={() =>
                router.push(`/category/${encodeURIComponent(article.category.slug)}`)
              }
              hitSlop={8}
            >
              <Text style={[styles.topCategoryText, { color: palette.quiet }]}>
                {language === "ne" && article.category.name_ne
                  ? article.category.name_ne
                  : article.category.name}
              </Text>
            </Pressable>
            <BookmarkButton article={article} showLabel size={16} />
          </View>
        ) : null}

        {/* Reading Progress Bar */}
        <View
          style={styles.progressTrack}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: palette.red,
                transform: [{ translateX: progressTranslate }],
              },
            ]}
          />
        </View>
      </View>

      {isLoading && !article ? (
        <Animated.ScrollView contentContainerStyle={styles.scrollContent}>
          <ArticleLoadingSkeleton />
        </Animated.ScrollView>
      ) : isError && !article ? (
        <View style={styles.centeredWrap}>
          <ErrorState
            title="Could not load this story"
            message="Please check your internet connection and try again."
            onRetry={() => void refetch()}
          />
        </View>
      ) : !article ? (
        <View style={styles.centeredWrap}>
          <EmptyState
            kicker="404 · Story not found"
            title="This dispatch is unavailable"
            description="The article you requested may have been moved or is no longer published."
            actionLabel="Return to Front Page"
            onAction={() => router.replace("/")}
          />
        </View>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onLayout={(e) => {
            viewportHeight.current = e.nativeEvent.layout.height;
            syncScrollable();
          }}
          onContentSizeChange={(_w, h) => {
            contentHeight.current = h;
            syncScrollable();
          }}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => void refetch()}
              tintColor={palette.ink}
            />
          }
        >
          <View style={styles.articlePadding}>
            {/* Section Kicker + Breaking Badge + Bilingual Toggle */}
            <View style={styles.kickerRow}>
              <View style={styles.kickerLeft}>
                <Pressable
                  onPress={() =>
                    router.push(
                      `/category/${encodeURIComponent(article.category.slug)}`,
                    )
                  }
                >
                  <Text style={[styles.categoryKicker, { color: palette.ink }]}>
                    {language === "ne" && article.category.name_ne
                      ? article.category.name_ne
                      : article.category.name}
                  </Text>
                </Pressable>
                {article.is_breaking ? (
                  <>
                    <Text style={[styles.dot, { color: palette.rule2 }]}>·</Text>
                    <Text
                      style={[
                        styles.investigationTag,
                        { color: palette.red },
                      ]}
                    >
                      Breaking
                    </Text>
                  </>
                ) : null}
              </View>

              {hasNepaliTranslation ? (
                <View style={styles.bilingualSwitch}>
                  <Pressable onPress={() => setLanguage("en")} hitSlop={8}>
                    <Text
                      style={[
                        styles.langSwitchOption,
                        {
                          color: language === "en" ? palette.ink : palette.quiet,
                          textDecorationLine:
                            language === "en" ? "underline" : "none",
                        },
                      ]}
                    >
                      English
                    </Text>
                  </Pressable>
                  <Text style={[styles.dot, { color: palette.rule2 }]}>/</Text>
                  <Pressable onPress={() => setLanguage("ne")} hitSlop={8}>
                    <Text
                      style={[
                        styles.langSwitchDeva,
                        {
                          color: language === "ne" ? palette.ink : palette.quiet,
                          textDecorationLine:
                            language === "ne" ? "underline" : "none",
                        },
                      ]}
                    >
                      नेपाली
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Headline */}
            <Text
              style={[
                showNepali && article.title_ne
                  ? styles.headlineDeva
                  : styles.headline,
                { color: palette.ink },
              ]}
              accessibilityRole="header"
            >
              {displayTitle}
            </Text>

            {/* Standfirst */}
            {displayStandfirst ? (
              <Text
                style={[
                  showNepali && article.excerpt_ne
                    ? styles.standfirstDeva
                    : styles.standfirst,
                  { color: palette.ink2 },
                ]}
              >
                {displayStandfirst}
              </Text>
            ) : null}

            {/* Rule-bounded Byline Band */}
            <ArticleBylineBand article={article} style={styles.bylineSpacing} />

            {/* Listen to this story (device speech engine) */}
            <ListenBar narration={narration} isNepali={isBodyNepali} />

            {/* Top Share & Save Bar */}
            <ShareBar article={article} style={styles.topShareSpacing} />

            {/* Hero Image */}
            {article.hero_image && !heroImageFailed ? (
              <View style={styles.heroFigure}>
                <View
                  style={[
                    styles.heroImageContainer,
                    { backgroundColor: palette.paper2 },
                  ]}
                >
                  <Image
                    source={{ uri: sizedImageUrl(article.hero_image, IMAGE_WIDTHS.hero) }}
                    accessibilityLabel={article.hero_alt || article.title}
                    style={styles.heroImage}
                    contentFit="cover"
                    transition={220}
                    cachePolicy="memory-disk"
                    onError={() => setHeroImageFailed(true)}
                  />
                </View>
                {article.hero_credit ? (
                  <Text
                    style={[styles.heroCaption, { color: palette.quiet }]}
                  >
                    {article.hero_credit}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Notice if Nepali is selected but only English body is available */}
            {language === "ne" && !article.body_ne ? (
              <View
                style={[
                  styles.translationNotice,
                  {
                    backgroundColor: palette.paper2,
                    borderColor: palette.rule,
                  },
                ]}
              >
                <Text
                  style={[styles.translationNoticeText, { color: palette.quiet }]}
                >
                  यो रिपोर्ट अंग्रेजीमा प्रकाशित गरिएको छ। नेपाली अनुवाद उपलब्ध भएमा यहाँ देखाइनेछ।
                </Text>
              </View>
            ) : null}

            {/* Long-form Article Body */}
            <View style={styles.bodyWrapper}>
              <ArticleContent html={displayBody} isNepali={isBodyNepali} />
            </View>

            {/* Bottom Share & Save Bar */}
            <View
              style={[
                styles.bottomShareWrap,
                { borderTopColor: palette.rule },
              ]}
            >
              <ShareBar article={article} />
            </View>

            {/* Topics / Tags */}
            {article.tags && article.tags.length > 0 ? (
              <View
                style={[
                  styles.metaBand,
                  { borderTopColor: palette.rule },
                ]}
              >
                <Text style={[styles.metaBandLabel, { color: palette.ink }]}>
                  Topics
                </Text>
                <View style={styles.tagsWrap}>
                  {article.tags.map((tag) => (
                    <Pressable
                      key={tag.slug}
                      onPress={() =>
                        router.push({
                          pathname: "/search",
                          params: { tag: tag.slug },
                        })
                      }
                      accessibilityRole="link"
                      accessibilityLabel={`Browse stories tagged ${tag.name}`}
                      hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
                      style={[
                        styles.tagPill,
                        { borderColor: palette.rule2 },
                      ]}
                    >
                      <Text style={[styles.tagText, { color: palette.quiet }]}>
                        #{tag.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Editions */}
            {article.editions && article.editions.length > 0 ? (
              <View
                style={[
                  styles.metaBand,
                  { borderTopColor: palette.rule },
                ]}
              >
                <Text style={[styles.metaBandLabel, { color: palette.ink }]}>
                  Editions
                </Text>
                <View style={styles.tagsWrap}>
                  {article.editions.map((ed) => {
                    const edInfo = editions.find((e) => e.slug === ed);
                    return (
                      <Text
                        key={ed}
                        style={[styles.editionText, { color: palette.quiet }]}
                      >
                        {edInfo ? edInfo.name : ed}
                      </Text>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Reporter Bio */}
            <AuthorBioCard article={article} />

            {/* Corrections & Clarifications Notice */}
            <View
              style={[
                styles.correctionsBlock,
                { borderTopColor: palette.rule },
              ]}
            >
              <Text style={[styles.correctionsText, { color: palette.quiet }]}>
                <Text style={[styles.correctionsBold, { color: palette.ink }]}>
                  Corrections & clarifications.
                </Text>{" "}
                We correct factual errors promptly and note substantive changes
                at the foot of the article. Write to{" "}
                <Text
                  style={[styles.correctionsLink, { color: palette.ink }]}
                  onPress={() =>
                    void Linking.openURL(`mailto:${site.correctionsEmail}`).catch(
                      () => {},
                    )
                  }
                >
                  {site.correctionsEmail}
                </Text>
                .
              </Text>
            </View>

            {/* Newsletter Box */}
            <View style={styles.newsletterSpacing}>
              <NewsletterBox compact />
            </View>

            {/* Related Reading */}
            {related.length > 0 ? (
              <View style={styles.relatedSection}>
                <SectionRule
                  title="Related reading"
                  cta={`More in ${article.category.name}`}
                  onPressCta={() =>
                    router.push(
                      `/category/${encodeURIComponent(article.category.slug)}`,
                    )
                  }
                />
                {related.map((rel, index) => (
                  <View
                    key={rel.id}
                    style={[
                      styles.relatedItem,
                      index > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: palette.rule,
                      },
                    ]}
                  >
                    <ArticleCard article={rel} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Animated.ScrollView>
      )}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    position: "relative",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
  },
  backLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  topRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  topCategoryText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 2,
    width: "100%",
  },
  scrollContent: {
    paddingBottom: 48,
  },
  centeredWrap: {
    flex: 1,
    paddingHorizontal: spacing.gutter,
    justifyContent: "center",
  },
  articlePadding: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 22,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
  },
  kickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryKicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  investigationTag: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  dot: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
  },
  bilingualSwitch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  langSwitchOption: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  langSwitchDeva: {
    fontFamily: fontFamilies.devaMedium,
    fontSize: 12,
  },
  headline: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -0.6,
    marginTop: 14,
  },
  headlineDeva: {
    fontFamily: fontFamilies.devaMedium,
    fontSize: 28,
    lineHeight: 40,
    marginTop: 14,
  },
  standfirst: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 19,
    lineHeight: 27,
    marginTop: 14,
  },
  standfirstDeva: {
    fontFamily: fontFamilies.devaRegular,
    fontSize: 18,
    lineHeight: 29,
    marginTop: 14,
  },
  bylineSpacing: {
    marginTop: 22,
  },
  topShareSpacing: {
    marginTop: 14,
  },
  heroFigure: {
    marginTop: 22,
  },
  heroImageContainer: {
    width: "100%",
    aspectRatio: 16 / 10,
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroCaption: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  translationNotice: {
    marginTop: 20,
    padding: 12,
    borderWidth: 1,
  },
  translationNoticeText: {
    fontFamily: fontFamilies.devaRegular,
    fontSize: 13.5,
    lineHeight: 21,
  },
  bodyWrapper: {
    marginTop: 26,
  },
  bottomShareWrap: {
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
  },
  metaBand: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  metaBandLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    paddingTop: 3,
  },
  tagsWrap: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 30,
    justifyContent: "center",
  },
  tagText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
  },
  editionText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12.5,
  },
  correctionsBlock: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  correctionsText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 18,
  },
  correctionsBold: {
    fontFamily: fontFamilies.sansMedium,
    fontWeight: "500",
  },
  correctionsLink: {
    textDecorationLine: "underline",
  },
  newsletterSpacing: {
    marginTop: 28,
  },
  relatedSection: {
    marginTop: 36,
  },
  relatedItem: {
    paddingVertical: 18,
  },
});
