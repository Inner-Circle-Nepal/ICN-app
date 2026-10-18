import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { ArticleCard as ArticleCardType } from "@/types/domain";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { timeAgo } from "@/utils/format";
import { IMAGE_WIDTHS, sizedImageUrl } from "@/utils/images";
import { BookmarkButton } from "./BookmarkButton";

/**
 * Lead story component (`variant="lead"` in `site/src/components/news/Story.tsx`).
 *
 *   - Kicker (with LIVE / BREAKING marker in #db0a12 when active)
 *   - Display headline in Newsreader 300 Light (`display`)
 *   - 16:9 photograph via `expo-image` only when `hero_image` exists and loads
 *   - Standfirst excerpt in Newsreader 400
 *   - Byline with relative timestamp, reading time, and bookmark toggle
 */

interface FeaturedStoryProps {
  article: ArticleCardType;
  style?: ViewStyle;
}

export function StoryKicker({
  article,
  onPressCategory,
}: {
  article: ArticleCardType;
  onPressCategory?: () => void;
}) {
  const { palette, language } = useTheme();
  const isLiveOrBreaking = article.is_live || article.is_breaking;
  const catLabel =
    language === "ne" && article.category.name_ne
      ? article.category.name_ne
      : article.category.name;

  return (
    <View style={styles.kickerRow}>
      {isLiveOrBreaking ? (
        <>
          <Text style={[styles.kickerText, { color: palette.red }]}>
            {article.is_live ? "LIVE" : "BREAKING"}
          </Text>
          <Text style={[styles.kickerSlash, { color: palette.rule2 }]}>/</Text>
        </>
      ) : null}
      {onPressCategory ? (
        <Pressable onPress={onPressCategory} hitSlop={8}>
          <Text style={[styles.kickerText, { color: palette.ink }]}>{catLabel}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.kickerText, { color: palette.ink }]}>{catLabel}</Text>
      )}
    </View>
  );
}

export function StoryByline({
  article,
  showBookmark = true,
}: {
  article: ArticleCardType;
  showBookmark?: boolean;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.bylineRow}>
      <Text style={[styles.meta, { color: palette.quiet }]} numberOfLines={1}>
        {article.author ? (
          <>
            <Text style={{ color: palette.ink2 }}>{article.author.name}</Text>
            <Text style={{ color: palette.rule2 }}> · </Text>
          </>
        ) : null}
        {timeAgo(article.published_at)}
        <Text style={{ color: palette.rule2 }}> · </Text>
        {article.reading_minutes} min read
      </Text>
      {showBookmark ? <BookmarkButton article={article} size={15} /> : null}
    </View>
  );
}

export function FeaturedStory({ article, style }: FeaturedStoryProps) {
  const router = useRouter();
  const { palette, language } = useTheme();
  const [imageError, setImageError] = useState(false);

  const hasImage = Boolean(article.hero_image) && !imageError;
  const useNeTitle = language === "ne" && Boolean(article.title_ne);
  const useNeExcerpt = language === "ne" && Boolean(article.excerpt_ne);

  const openArticle = () => {
    router.push(`/article/${encodeURIComponent(article.slug)}`);
  };

  const openCategory = () => {
    router.push(`/category/${encodeURIComponent(article.category.slug)}`);
  };

  return (
    <View style={[styles.container, style]}>
      <StoryKicker article={article} onPressCategory={openCategory} />

      <Pressable
        onPress={openArticle}
        accessibilityRole="link"
        accessibilityLabel={article.title}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text
          style={[
            useNeTitle ? styles.headlineNe : styles.headline,
            { color: palette.ink },
          ]}
        >
          {useNeTitle ? article.title_ne : article.title}
        </Text>

        {hasImage ? (
          <View
            style={[
              styles.imageWrapper,
              { backgroundColor: palette.paper2 },
            ]}
          >
            <Image
              source={{ uri: sizedImageUrl(article.hero_image, IMAGE_WIDTHS.hero) }}
              accessibilityLabel={article.hero_alt ?? article.title}
              style={styles.image}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              onError={() => setImageError(true)}
            />
          </View>
        ) : null}

        {article.excerpt ? (
          <Text
            style={[
              useNeExcerpt ? styles.excerptNe : styles.excerpt,
              { color: palette.ink2 },
            ]}
          >
            {useNeExcerpt ? article.excerpt_ne : article.excerpt}
          </Text>
        ) : null}
      </Pressable>

      <View style={styles.bylineSpacing}>
        <StoryByline article={article} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  pressed: {
    opacity: 0.78,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  kickerText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  kickerSlash: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
  },
  headline: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.6,
  },
  headlineNe: {
    fontFamily: fontFamilies.devaMedium,
    fontSize: 28,
    lineHeight: 38,
  },
  imageWrapper: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginTop: 18,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  excerpt: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 18,
    lineHeight: 27,
    marginTop: 16,
  },
  excerptNe: {
    fontFamily: fontFamilies.devaRegular,
    fontSize: 17,
    lineHeight: 28,
    marginTop: 16,
  },
  bylineSpacing: {
    marginTop: 12,
  },
  bylineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  meta: {
    flex: 1,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 18,
  },
});
