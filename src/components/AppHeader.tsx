import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import type { Category } from "@/types/domain";
import { useTheme } from "@/hooks/useTheme";
import { spacing } from "@/theme/tokens";
import { Logo } from "./Logo";
import { CategoryChip } from "./CategoryChip";
import { isClerkConfigured } from "@/constants/config";
import { useAuth } from "@clerk/clerk-expo";

/**
 * The reader's account: their profile when signed in, sign-in otherwise.
 * A separate component so Clerk's hook only runs in builds that have Clerk.
 */
function AccountButton() {
  const router = useRouter();
  const { palette } = useTheme();
  const { isSignedIn } = useAuth();
  return (
    <Pressable
      onPress={() => router.push(isSignedIn ? "/profile" : "/sign-in")}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={isSignedIn ? "Your profile" : "Sign in"}
      style={styles.iconBtn}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={8} r={4} stroke={palette.ink} strokeWidth={1.8} />
        <Path
          d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"
          stroke={palette.ink}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
}

/**
 * Editorial Masthead (`AppHeader`).
 *
 * Mirrors `site/src/components/layout/Header.tsx`:
 *   - Top masthead row: ICN Logo, then Search and the reader's account.
 *     The EN/नेपाली switch lives in Settings ("Primary Reading Language").
 *   - Optional horizontally scrolling section strip separated by 1px rules
 */

interface AppHeaderProps {
  categories?: Category[];
  activeCategorySlug?: string;
  onSelectCategory?: (slug: string) => void;
  showSectionBar?: boolean;
  /** Off on screens that already have their own search box (Newsroom). */
  showSearch?: boolean;
}

export function AppHeader({
  categories = [],
  activeCategorySlug,
  onSelectCategory,
  showSectionBar = true,
  showSearch = true,
}: AppHeaderProps) {
  const router = useRouter();
  const { palette } = useTheme();

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
          {showSearch ? (
            <Pressable
              onPress={() => router.push("/search")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Search articles"
              style={styles.iconBtn}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Circle cx={11} cy={11} r={7} stroke={palette.ink} strokeWidth={1.8} />
                <Path
                  d="m16.5 16.5 4.5 4.5"
                  stroke={palette.ink}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </Svg>
            </Pressable>
          ) : null}

          {isClerkConfigured ? <AccountButton /> : null}
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
    gap: 18,
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
