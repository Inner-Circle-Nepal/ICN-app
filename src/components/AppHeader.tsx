import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import type { Category } from "@/types/domain";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { Logo } from "./Logo";
import { CategoryChip } from "./CategoryChip";

/**
 * Editorial Masthead (`AppHeader`).
 *
 * Mirrors `site/src/components/layout/Header.tsx`:
 *   - Top masthead row: ICN Logo + Search icon + EN/नेपाली language toggle
 *   - Optional horizontally scrolling section strip separated by 1px rules
 */

interface AppHeaderProps {
  categories?: Category[];
  activeCategorySlug?: string;
  onSelectCategory?: (slug: string) => void;
  showSectionBar?: boolean;
}

export function AppHeader({
  categories = [],
  activeCategorySlug,
  onSelectCategory,
  showSectionBar = true,
}: AppHeaderProps) {
  const router = useRouter();
  const { palette, language, setLanguage } = useTheme();

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "ne" : "en");
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: palette.paper }]}>
      <View
        style={[
          styles.mastheadRow,
          { borderBottomColor: palette.rule },
        ]}
      >
        <Pressable
          onPress={() => router.navigate("/")}
          accessibilityRole="link"
          accessibilityLabel="Inner Circle Nepal — Home"
        >
          <Logo size="sm" />
        </Pressable>

        <View style={styles.rightActions}>
          <Pressable
            onPress={toggleLanguage}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={
              language === "en" ? "Switch reading language to Nepali" : "Switch reading language to English"
            }
            style={styles.langToggle}
          >
            <Text
              style={[
                styles.langText,
                {
                  color: language === "en" ? palette.ink : palette.quiet,
                  textDecorationLine: language === "en" ? "underline" : "none",
                },
              ]}
            >
              EN
            </Text>
            <Text style={[styles.langDivider, { color: palette.rule2 }]}>/</Text>
            <Text
              style={[
                styles.langTextDeva,
                {
                  color: language === "ne" ? palette.ink : palette.quiet,
                  textDecorationLine: language === "ne" ? "underline" : "none",
                },
              ]}
            >
              ने
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/search")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Search articles"
            style={styles.iconBtn}
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Circle
                cx={11}
                cy={11}
                r={7}
                stroke={palette.ink}
                strokeWidth={1.6}
              />
              <Path
                d="m16.5 16.5 4.5 4.5"
                stroke={palette.ink}
                strokeWidth={1.6}
                strokeLinecap="round"
              />
            </Svg>
          </Pressable>
        </View>
      </View>

      {showSectionBar && categories.length > 0 ? (
        <View
          style={[
            styles.sectionBar,
            { borderBottomColor: palette.rule },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sectionScrollContent}
          >
            {categories.map((cat) => (
              <CategoryChip
                key={cat.slug}
                name={cat.name}
                nameNe={cat.name_ne}
                active={activeCategorySlug === cat.slug}
                onPress={() => {
                  if (onSelectCategory) {
                    onSelectCategory(cat.slug);
                  } else {
                    router.push(`/category/${encodeURIComponent(cat.slug)}`);
                  }
                }}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
  },
  mastheadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.gutter,
    height: 56,
    borderBottomWidth: 1,
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  langToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  langText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  langTextDeva: {
    fontFamily: fontFamilies.devaMedium,
    fontSize: 12,
  },
  langDivider: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
  },
  iconBtn: {
    padding: 4,
  },
  sectionBar: {
    borderBottomWidth: 1,
  },
  sectionScrollContent: {
    paddingHorizontal: spacing.gutter,
    alignItems: "center",
  },
});
