import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { ArticleCard as ArticleCardType } from "@/types/domain";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { IMAGE_WIDTHS, sizedImageUrl } from "@/utils/images";
import { StoryByline, StoryKicker } from "./FeaturedStory";

/**
 * Editorial list story variants (`top`, `brief`, `numbered`, `compact`).
 *
 * Mirrors `site/src/components/news/Story.tsx` ("Also leading", wire briefs,
 * "Most read" numbered list, and compact thumbnail rows).
 */

export type ListStoryVariant = "top" | "brief" | "numbered" | "compact";

interface ArticleListItemProps {
  article: ArticleCardType;
  variant?: ListStoryVariant;
  index?: number;
  showTopRule?: boolean;
  style?: ViewStyle;
}

export function ArticleListItem({
  article,
  variant = "top",
  index = 0,
  showTopRule = false,
  style,
}: ArticleListItemProps) {
  const router = useRouter();
  const { palette, language } = useTheme();
  const [thumbError, setThumbError] = useState(false);

  const useNeTitle = language === "ne" && Boolean(article.title_ne);
  const useNeExcerpt = language === "ne" && Boolean(article.excerpt_ne);
  const hasThumb = variant === "compact" && Boolean(article.hero_image) && !thumbError;

  const openArticle = () => {
    router.push(`/article/${encodeURIComponent(article.slug)}`);
  };

  const openCategory = () => {
    router.push(`/category/${encodeURIComponent(article.category.slug)}`);
  };

  const ruleStyle = showTopRule
    ? {
        borderTopWidth: 1,
        borderTopColor: palette.rule,
        paddingTop: 18,
      }
    : undefined;

  if (variant === "numbered") {
    return (
      <View style={[styles.itemContainer, ruleStyle, style]}>
        <Pressable
          onPress={openArticle}
          accessibilityRole="link"
          accessibilityLabel={`${index + 1}. ${article.title}`}
          style={({ pressed }) => [styles.numberedRow, pressed && styles.pressed]}
        >
          <Text style={[styles.numberIndex, { color: palette.quiet }]}>
            {String(index + 1).padStart(2, "0")}
          </Text>
          <View style={styles.numberedContent}>
            <StoryKicker article={article} onPressCategory={openCategory} />
            <Text
              style={[
                useNeTitle ? styles.briefTitleNe : styles.numberedTitle,
                { color: palette.ink },
              ]}
            >
              {useNeTitle ? article.title_ne : article.title}
            </Text>
            <View style={styles.smallBylineGap}>
              <StoryByline article={article} showBookmark={false} />
            </View>
          </View>
        </Pressable>
      </View>
    );
  }

  if (variant === "brief") {
    return (
      <View style={[styles.itemContainer, ruleStyle, style]}>
        <StoryKicker article={article} onPressCategory={openCategory} />
        <Pressable
          onPress={openArticle}
          accessibilityRole="link"
          accessibilityLabel={article.title}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Text
            style={[
              useNeTitle ? styles.briefTitleNe : styles.briefTitle,
              { color: palette.ink },
            ]}
          >
            {useNeTitle ? article.title_ne : article.title}
          </Text>
        </Pressable>
        <View style={styles.smallBylineGap}>
          <StoryByline article={article} />
        </View>
      </View>
    );
  }

  if (variant === "compact") {
    return (
      <View style={[styles.itemContainer, ruleStyle, style]}>
        <Pressable
          onPress={openArticle}
          accessibilityRole="link"
          accessibilityLabel={article.title}
          style={({ pressed }) => [styles.compactRow, pressed && styles.pressed]}
        >
          <View style={styles.compactTextCol}>
            <StoryKicker article={article} onPressCategory={openCategory} />
            <Text
              style={[
                useNeTitle ? styles.topTitleNe : styles.compactTitle,
                { color: palette.ink },
              ]}
            >
              {useNeTitle ? article.title_ne : article.title}
            </Text>
            {article.excerpt ? (
              <Text
                style={[
                  useNeExcerpt ? styles.excerptNe : styles.excerpt,
                  { color: palette.quiet },
                ]}
                numberOfLines={2}
              >
                {useNeExcerpt ? article.excerpt_ne : article.excerpt}
              </Text>
            ) : null}
          </View>

          {hasThumb ? (
            <View
              style={[
                styles.thumbBox,
                { backgroundColor: palette.paper2 },
              ]}
            >
              <Image
                source={{ uri: sizedImageUrl(article.hero_image, IMAGE_WIDTHS.thumb) }}
                accessibilityLabel={article.hero_alt ?? article.title}
                style={styles.thumbImage}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
                onError={() => setThumbError(true)}
              />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.bylineGap}>
          <StoryByline article={article} />
        </View>
      </View>
    );
  }

  // Default: "top"
  return (
    <View style={[styles.itemContainer, ruleStyle, style]}>
      <StoryKicker article={article} onPressCategory={openCategory} />
      <Pressable
        onPress={openArticle}
        accessibilityRole="link"
        accessibilityLabel={article.title}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Text
          style={[
            useNeTitle ? styles.topTitleNe : styles.topTitle,
            { color: palette.ink },
          ]}
        >
          {useNeTitle ? article.title_ne : article.title}
        </Text>
        {article.excerpt ? (
          <Text
            style={[
              useNeExcerpt ? styles.excerptNe : styles.excerpt,
              { color: palette.quiet },
            ]}
            numberOfLines={2}
          >
            {useNeExcerpt ? article.excerpt_ne : article.excerpt}
          </Text>
        ) : null}
      </Pressable>
      <View style={styles.bylineGap}>
        <StoryByline article={article} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    width: "100%",
  },
  pressed: {
    opacity: 0.76,
  },
  topTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  topTitleNe: {
    fontFamily: fontFamilies.devaMedium,
    fontSize: 19,
    lineHeight: 27,
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  compactTextCol: {
    flex: 1,
    minWidth: 0,
  },
  compactTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 18.5,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  thumbBox: {
    width: 88,
    height: 66,
    overflow: "hidden",
    marginTop: 4,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  briefTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 17.5,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  briefTitleNe: {
    fontFamily: fontFamilies.devaMedium,
    fontSize: 17,
    lineHeight: 25,
  },
  numberedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  numberIndex: {
    width: 24,
    paddingTop: 2,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  numberedContent: {
    flex: 1,
    minWidth: 0,
  },
  numberedTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 17,
    lineHeight: 21.5,
    letterSpacing: -0.15,
  },
  excerpt: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
  },
  excerptNe: {
    fontFamily: fontFamilies.devaRegular,
    fontSize: 14.5,
    lineHeight: 23,
    marginTop: 7,
  },
  bylineGap: {
    marginTop: 10,
  },
  smallBylineGap: {
    marginTop: 6,
  },
});
