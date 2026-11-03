import React, { memo, useCallback, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import type { ArticleCard } from "@/types/domain";
import { useBookmarks } from "@/features/bookmarks/BookmarksContext";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { canonicalArticleUrl, timeAgo } from "@/utils/format";
import { IMAGE_WIDTHS, sizedImageUrl } from "@/utils/images";

/**
 * One story in the home feed: a full-screen vertical (9:16-style) page,
 * scrolled one at a time like a reel. The section, time, headline and a
 * short caption sit at the foot, with Save and Share.
 *
 * The newsroom's photographs are landscape (about 1080×795), and a 9:16 crop
 * of that keeps only ~450 px of width, which looks soft on a phone. So the
 * whole photograph is shown sharp across the width, over a blurred, darkened
 * copy of itself that fills the frame, the way social apps present landscape
 * media in a vertical feed. A portrait 1080×1920 upload simply fills it.
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

  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={`${flag ? `${flag}. ` : ""}${section}. ${title}`}
      style={[styles.page, { height, backgroundColor: palette.ink }]}
    >
      {uri ? (
        <>
          {/* Blurred fill behind, so the frame is never empty. */}
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={28}
            cachePolicy="memory-disk"
            recyclingKey={`${article.slug}:bg`}
            accessible={false}
          />
          <View style={[StyleSheet.absoluteFill, styles.dim]} />
          {/* The photograph itself, whole and sharp, in the upper part of the page. */}
          <Image
            source={{ uri }}
            style={[styles.photo, { height: height * 0.62 }]}
            contentFit="contain"
            contentPosition="center"
            transition={150}
            cachePolicy="memory-disk"
            recyclingKey={article.slug}
            accessibilityIgnoresInvertColors
            onError={() => setImageError(true)}
          />
        </>
      ) : null}

      {/* The fade under the caption, for readable white text on any photo. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor="#000" stopOpacity="0" />
            <Stop offset="0.75" stopColor="#000" stopOpacity="0.6" />
            <Stop offset="1" stopColor="#000" stopOpacity="0.92" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#fade)" />
      </Svg>

      <View style={styles.foot}>
        <Text style={styles.kicker} numberOfLines={1}>
          {flag ? <Text style={styles.flag}>{flag} · </Text> : null}
          {section.toUpperCase()}
          <Text style={styles.dot}> · </Text>
          {timeAgo(article.published_at)}
        </Text>

        <Text style={[styles.title, ne && article.title_ne ? styles.titleNe : null]} numberOfLines={4}>
          {title}
        </Text>

        {caption ? (
          <Text style={[styles.caption, ne && article.excerpt_ne ? styles.captionNe : null]} numberOfLines={2}>
            {caption}
          </Text>
        ) : null}

        <View style={styles.actions}>
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
                stroke="#fff"
                strokeWidth={1.7}
                fill={saved ? "#fff" : "none"}
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={styles.actionText}>{saved ? "Saved" : "Save"}</Text>
          </Pressable>

          <Text style={styles.readMore}>Tap to read</Text>

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
                stroke="#fff"
                strokeWidth={1.7}
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={styles.actionText}>Share</Text>
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

/* Soft shadow under white text, for the brightest photographs. */
const SHADOW = {
  textShadowColor: "rgba(0,0,0,0.5)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

const styles = StyleSheet.create({
  page: { width: "100%", overflow: "hidden", justifyContent: "flex-end" },
  dim: { backgroundColor: "rgba(0,0,0,0.35)" },
  photo: { position: "absolute", top: 0, left: 0, right: 0 },
  foot: { paddingHorizontal: 18, paddingBottom: 14 },
  kicker: {
    color: "rgba(255,255,255,0.92)",
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12.5,
    letterSpacing: 0.5,
    ...SHADOW,
  },
  flag: { color: "#ff4d55" },
  dot: { color: "rgba(255,255,255,0.7)" },
  title: {
    color: "#fff",
    fontFamily: fontFamilies.serifMedium,
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.3,
    marginTop: 8,
    ...SHADOW,
  },
  titleNe: { fontFamily: fontFamilies.devaMedium, fontSize: 25, lineHeight: 36 },
  caption: {
    color: "rgba(255,255,255,0.88)",
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15.5,
    lineHeight: 22,
    marginTop: 8,
    ...SHADOW,
  },
  captionNe: { fontFamily: fontFamilies.devaRegular, fontSize: 15, lineHeight: 24 },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36 },
  actionText: { color: "#fff", fontFamily: fontFamilies.sansMedium, fontSize: 13.5 },
  readMore: {
    color: "rgba(255,255,255,0.6)",
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
