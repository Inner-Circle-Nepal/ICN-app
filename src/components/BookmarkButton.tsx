import React from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";
import type { Article, ArticleCard } from "@/types/domain";
import { useBookmarks } from "@/features/bookmarks/BookmarksContext";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

interface BookmarkButtonProps {
  article: ArticleCard | Article;
  showLabel?: boolean;
  size?: number;
}

export function BookmarkButton({
  article,
  showLabel = false,
  size = 16,
}: BookmarkButtonProps) {
  const { palette } = useTheme();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const saved = isBookmarked(article.slug);

  const handlePress = () => {
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync().catch(() => {});
    }
    toggleBookmark(article);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? "Remove from saved stories" : "Save story for later"}
      style={styles.button}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M6 4h12a1 1 0 0 1 1 1v15.5l-7-4-7 4V5a1 1 0 0 1 1-1Z"
          stroke={saved ? palette.ink : palette.quiet}
          strokeWidth={1.5}
          fill={saved ? palette.ink : "none"}
          strokeLinejoin="round"
        />
      </Svg>
      {showLabel ? (
        <Text
          style={[
            styles.label,
            {
              color: saved ? palette.ink : palette.quiet,
              textDecorationLine: saved ? "underline" : "none",
            },
          ]}
        >
          {saved ? "Saved" : "Save"}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 4,
  },
  label: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
  },
});
