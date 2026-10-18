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
 * Standard editorial story block (`variant="standard"` in `site/src/components/news/Story.tsx`).
 *
 * No rounded card borders or drop shadows — structured purely by typography,
 * 3:2 photography (only when `hero_image` exists), and hairlines.
 */

interface ArticleCardProps {
  article: ArticleCardType;
  withImage?: boolean;
  style?: ViewStyle;
}

export function ArticleCard({
  article,
  withImage = true,
  style,
}: ArticleCardProps) {
  const router = useRouter();
  const { palette, language } = useTheme();
  const [imageError, setImageError] = useState(false);

  const hasImage = withImage && Boolean(article.hero_image) && !imageError;
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
      <Pressable
        onPress={openArticle}
        accessibilityRole="link"
        accessibilityLabel={article.title}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {hasImage ? (
          <View
            style={[
              styles.imageWrapper,
              { backgroundColor: palette.paper2 },
            ]}
          >
            <Image
              source={{ uri: sizedImageUrl(article.hero_image, IMAGE_WIDTHS.card) }}
              accessibilityLabel={article.hero_alt ?? article.title}
              style={styles.image}
              contentFit="cover"
              transition={180}
              cachePolicy="memory-disk"
              onError={() => setImageError(true)}
            />
          </View>
        ) : null}

        <StoryKicker article={article} onPressCategory={openCategory} />

        <Text
          style={[
            useNeTitle ? styles.headlineNe : styles.headline,
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
            numberOfLines={3}
          >
            {useNeExcerpt ? article.excerpt_ne : article.excerpt}
          </Text>
        ) : null}
      </Pressable>

      <View style={styles.bylineWrap}>
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
  imageWrapper: {
    width: "100%",
    aspectRatio: 3 / 2,
    marginBottom: 14,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  headline: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.25,
  },
  headlineNe: {
    fontFamily: fontFamilies.devaMedium,
    fontSize: 19,
    lineHeight: 27,
  },
  excerpt: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15.5,
    lineHeight: 23,
    marginTop: 8,
  },
  excerptNe: {
    fontFamily: fontFamilies.devaRegular,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 8,
  },
  bylineWrap: {
    marginTop: 10,
  },
});
