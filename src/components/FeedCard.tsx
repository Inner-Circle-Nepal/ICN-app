import React, { memo, useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
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
 * One story in the home feed, drawn like a social post.
 *
 * The photograph fills the card; a fade at the foot carries the section,
 * the time, the headline and the two actions in white, so the picture does
 * the work a broadsheet does with columns. A story without a photograph gets
 * a compact card on solid ink, sized to its text, never an empty frame.
 *
 * Save and Share are the actions because both exist: there is no comment
 * system, so no comment count is drawn.
 */

export const FEED_GUTTER = 10;
const ASPECT = 0.68; // height / width, close to the 3:2 the newsroom shoots

function FeedCardInner({ article }: { article: ArticleCard }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { language, palette } = useTheme();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const [imageError, setImageError] = useState(false);

  const cardWidth = width - FEED_GUTTER * 2;
  const height = Math.round(cardWidth * ASPECT);
  const hasImage = Boolean(article.hero_image) && !imageError;
  const saved = isBookmarked(article.slug);

  const title =
    language === "ne" && article.title_ne ? article.title_ne : article.title;
  const section =
    language === "ne" && article.category.name_ne
      ? article.category.name_ne
      : article.category.name;
  const flag = article.is_live
    ? "LIVE"
    : article.is_breaking
      ? "BREAKING"
      : null;

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
          ios: {
            title: article.title,
            url,
            message: `${article.title} — Inner Circle Nepal`,
          },
          default: {
            title: article.title,
            message: `${article.title}\n${url}`,
          },
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
      style={({ pressed }) => [
        styles.card,
        // A story without a photograph is a compact text card, not an empty frame.
        hasImage ? { height } : styles.textOnly,
        { backgroundColor: palette.ink },
        pressed && styles.pressed,
      ]}
    >
      {hasImage ? (
        <Image
          source={{ uri: sizedImageUrl(article.hero_image, IMAGE_WIDTHS.hero) }}
          accessibilityIgnoresInvertColors
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={article.slug}
          onError={() => setImageError(true)}
        />
      ) : null}

      {/* The fade that keeps white text readable on any photograph. */}
      {hasImage ? (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.25" stopColor="#000" stopOpacity="0" />
              <Stop offset="0.6" stopColor="#000" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#000" stopOpacity="0.88" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#fade)" />
        </Svg>
      ) : null}

      <View style={styles.foot}>
        <Text style={styles.kicker} numberOfLines={1}>
          {flag ? <Text style={styles.flag}>{flag} · </Text> : null}
          {section.toUpperCase()}
          <Text style={styles.dot}> · </Text>
          {timeAgo(article.published_at)}
        </Text>

        <Text
          style={[
            styles.title,
            language === "ne" && article.title_ne ? styles.titleNe : null,
          ]}
          numberOfLines={3}
        >
          {title}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={save}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={
              saved ? "Remove from saved stories" : "Save story"
            }
            style={styles.action}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
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

          <Pressable
            onPress={() => void share()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Share "${title}"`}
            style={styles.action}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
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

/** Placeholder with the card's exact footprint, so the feed does not jump on load. */
export function FeedCardSkeleton() {
  const { width } = useWindowDimensions();
  const { palette } = useTheme();
  const height = Math.round((width - FEED_GUTTER * 2) * ASPECT);
  return (
    <View style={[styles.card, { height, backgroundColor: palette.paper2 }]} />
  );
}

/* Soft shadow under white text, for the brightest photographs. */
const SHADOW = {
  textShadowColor: "rgba(0,0,0,0.45)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: FEED_GUTTER,
    marginBottom: FEED_GUTTER,
    borderRadius: 8,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  textOnly: { paddingTop: 18 },
  pressed: { opacity: 0.92 },
  foot: { paddingHorizontal: 16, paddingBottom: 12 },
  kicker: {
    color: "rgba(255,255,255,0.92)",
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 0.4,
    ...SHADOW,
  },
  flag: { color: "#ff4d55" },
  dot: { color: "rgba(255,255,255,0.7)" },
  title: {
    color: "#fff",
    fontFamily: fontFamilies.serifMedium,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.2,
    marginTop: 6,
    ...SHADOW,
  },
  titleNe: {
    fontFamily: fontFamilies.devaMedium,
    fontSize: 22,
    lineHeight: 32,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 },
  actionText: {
    color: "#fff",
    fontFamily: fontFamilies.sansMedium,
    fontSize: 13,
  },
});
