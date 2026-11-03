import React, { memo, useCallback, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";
import type { ArticleCard } from "@/types/domain";
import { useBookmarks } from "@/features/bookmarks/BookmarksContext";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { canonicalArticleUrl, timeAgo } from "@/utils/format";
import { IMAGE_WIDTHS, sizedImageUrl } from "@/utils/images";

/**
 * One story in the home feed: a full-screen vertical (9:16-style) page,
 * scrolled one at a time like a reel.
 *
 * The page sits on the same paper background as the rest of the app
 * (Chautari, Newsroom): the photograph fills the top of the page, and the
 * section, time, headline and a short caption follow in ink below it, with
 * Save and Share at the foot.
 *
 * Save and Share are the actions because both exist: there is no comment
 * system, so no comment count is drawn.
 */

interface FeedCardProps {
  article: ArticleCard;
  /** The page height: the feed's visible height, so each story fills it. */
  height: number;
}

function FeedCardInner({ article, height }: FeedCardProps) {
  const router = useRouter();
  const { language, palette } = useTheme();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const [imageError, setImageError] = useState(false);

  const hasImage = Boolean(article.hero_image) && !imageError;
  const uri = hasImage ? sizedImageUrl(article.hero_image, IMAGE_WIDTHS.hero) : undefined;
  const saved = isBookmarked(article.slug);

  const ne = language === "ne";
  const title = ne && article.title_ne ? article.title_ne : article.title;
  const caption = ne && article.excerpt_ne ? article.excerpt_ne : article.excerpt;
  const section = ne && article.category.name_ne ? article.category.name_ne : article.category.name;
  const flag = article.is_live ? "LIVE" : article.is_breaking ? "BREAKING" : null;

  const open = useCallback(() => {
    router.push(`/article/${encodeURIComponent(article.slug)}`);
  }, [router, article.slug]);

  const save = useCallback(() => {
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => {});
    toggleBookmark(article);
  }, [toggleBookmark, article]);

  const share = useCallback(async () => {
    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => {});
    const url = canonicalArticleUrl(article.category.slug, article.slug);
    try {
      await Share.share(
        Platform.select({
          ios: { title: article.title, url, message: `${article.title} — Inner Circle Nepal` },
          default: { title: article.title, message: `${article.title}\n${url}` },
        }),
      );
    } catch {
      // Dismissed or unsupported.
    }
  }, [article]);

  const ink = palette.ink;
  const quiet = palette.quiet;

  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={`${flag ? `${flag}. ` : ""}${section}. ${title}`}
      style={[styles.page, { height, backgroundColor: palette.paper, borderBottomColor: palette.rule }]}
    >
      <View style={[styles.photo, { height: height * 0.52, backgroundColor: palette.paper2 }]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="center"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={article.slug}
            accessibilityIgnoresInvertColors
            onError={() => setImageError(true)}
          />
        ) : null}
      </View>

      <View style={styles.body}>
        <View>
          <Text style={[styles.kicker, { color: quiet }]} numberOfLines={1}>
            {flag ? <Text style={{ color: palette.red }}>{flag} · </Text> : null}
            <Text style={{ color: palette.red }}>{section.toUpperCase()}</Text>
            {" · "}
            {timeAgo(article.published_at)}
          </Text>

          <Text
            style={[styles.title, { color: ink }, ne && article.title_ne ? styles.titleNe : null]}
            numberOfLines={4}
          >
            {title}
          </Text>

          {caption ? (
            <Text
              style={[styles.caption, { color: quiet }, ne && article.excerpt_ne ? styles.captionNe : null]}
              numberOfLines={3}
            >
              {caption}
            </Text>
          ) : null}
        </View>

        <View style={[styles.actions, { borderTopColor: palette.rule }]}>
          <Pressable
            onPress={save}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={saved ? "Remove from saved stories" : "Save story"}
            style={styles.action}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <Path
                d="M6 4h12a1 1 0 0 1 1 1v15.5l-7-4-7 4V5a1 1 0 0 1 1-1Z"
                stroke={ink}
                strokeWidth={1.7}
                fill={saved ? ink : "none"}
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={[styles.actionText, { color: ink }]}>{saved ? "Saved" : "Save"}</Text>
          </Pressable>

          <Text style={[styles.readMore, { color: quiet }]}>Tap to read</Text>

          <Pressable
            onPress={() => void share()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Share "${title}"`}
            style={styles.action}
          >
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path
                d="M14 5l7 6.5-7 6.5v-4c-5 0-8.5 1.5-11 5 1-5.5 4-10 11-11V5Z"
                stroke={ink}
                strokeWidth={1.7}
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={[styles.actionText, { color: ink }]}>Share</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export const FeedCard = memo(FeedCardInner);

/** Placeholder with a page's exact footprint, so the feed does not jump on load. */
export function FeedCardSkeleton({ height }: { height: number }) {
  const { palette } = useTheme();
  return <View style={[styles.page, { height, backgroundColor: palette.paper2 }]} />;
}

const styles = StyleSheet.create({
  page: { width: "100%", overflow: "hidden", borderBottomWidth: StyleSheet.hairlineWidth },
  photo: { width: "100%", overflow: "hidden" },
  body: { flex: 1, justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.3,
    marginTop: 8,
  },
  titleNe: { fontFamily: fontFamilies.devaMedium, fontSize: 23, lineHeight: 34 },
  caption: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15.5,
    lineHeight: 22,
    marginTop: 10,
  },
  captionNe: { fontFamily: fontFamilies.devaRegular, fontSize: 15, lineHeight: 24 },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36 },
  actionText: { fontFamily: fontFamilies.sansMedium, fontSize: 13.5 },
  readMore: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
