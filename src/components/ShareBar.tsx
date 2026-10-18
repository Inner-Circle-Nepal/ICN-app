import React, { useState } from "react";
import {
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import type { Article, ArticleCard } from "@/types/domain";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { canonicalArticleUrl } from "@/utils/format";
import { BookmarkButton } from "./BookmarkButton";

/**
 * Editorial Share and Save bar.
 *
 * Mirrors `site/src/components/news/ShareBar.tsx`:
 *   - Uses the native platform Share sheet with the canonical website URL
 *     (`https://icn.news/{category}/{slug}`) so shared links resolve for
 *     anyone, with or without the app installed.
 *   - Includes the persistent Bookmark button.
 */

interface ShareBarProps {
  article: Article | ArticleCard;
  style?: ViewStyle;
}

export function ShareBar({ article, style }: ShareBarProps) {
  const { palette } = useTheme();
  const [sharedFeedback, setSharedFeedback] = useState(false);

  const url = canonicalArticleUrl(article.category.slug, article.slug);

  const handleShare = async () => {
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync().catch(() => {});
    }
    try {
      const result = await Share.share(
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
      if (result.action === Share.sharedAction) {
        setSharedFeedback(true);
        setTimeout(() => setSharedFeedback(false), 2000);
      }
    } catch {
      // Dismissed or unsupported
    }
  };

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.kicker, { color: palette.ink }]}>Share</Text>

      <Pressable
        onPress={handleShare}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Share "${article.title}"`}
        style={styles.actionBtn}
      >
        <Text style={[styles.itemText, { color: palette.quiet }]}>
          {sharedFeedback ? "Shared" : "Share story…"}
        </Text>
      </Pressable>

      <Text style={[styles.dot, { color: palette.rule2 }]}>·</Text>

      <BookmarkButton article={article} showLabel size={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  actionBtn: {
    minHeight: 32,
    justifyContent: "center",
  },
  itemText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
  },
  dot: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
  },
});
