import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { useBookmarks } from "@/features/bookmarks/BookmarksContext";
import { useCategories } from "@/features/categories/useCategories";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { AppHeader } from "@/components/AppHeader";
import { ArticleCard } from "@/components/ArticleCard";
import { SectionRule } from "@/components/SectionRule";
import { EmptyState } from "@/components/EmptyState";

/**
 * Saved Stories / Reading List Screen (`app/bookmarks.tsx`).
 *
 * Persists lightweight article metadata in `AsyncStorage` across launches.
 */
export default function BookmarksScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const categoriesQuery = useCategories();
  const {
    bookmarkedCards,
    hydrated,
    clearAllBookmarks,
  } = useBookmarks();

  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <AppHeader
        categories={categoriesQuery.data ?? []}
        showSectionBar={false}
      />

      <FlatList
        data={bookmarkedCards}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View
              style={[
                styles.heroHeader,
                { borderBottomColor: palette.ink },
              ]}
            >
              <Text style={[styles.kicker, { color: palette.quiet }]}>
                Personal reading list · {bookmarkedCards.length}{" "}
                {bookmarkedCards.length === 1 ? "story" : "stories"}
              </Text>
              <Text style={[styles.title, { color: palette.ink }]}>
                Saved Dispatches
              </Text>
              <Text style={[styles.subtitle, { color: palette.quiet }]}>
                Stories you bookmark are kept on this device so you can return to
                long-form reporting and investigations at your own pace.
              </Text>
            </View>

            {bookmarkedCards.length > 0 ? (
              <View style={styles.ruleWrap}>
                <SectionRule
                  title="Your saved queue"
                  cta={confirmClear ? "Confirm clear all?" : "Clear list"}
                  onPressCta={() => {
                    if (confirmClear) {
                      clearAllBookmarks();
                      setConfirmClear(false);
                    } else {
                      setConfirmClear(true);
                    }
                  }}
                />
                {confirmClear ? (
                  <View style={styles.confirmRow}>
                    <Pressable
                      onPress={() => setConfirmClear(false)}
                      hitSlop={8}
                    >
                      <Text
                        style={[styles.cancelText, { color: palette.quiet }]}
                      >
                        Cancel
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          hydrated ? (
            <EmptyState
              kicker="Reading list empty"
              title="No saved stories yet"
              description="Tap the bookmark icon on any dispatch or inside an article to save it here for later reading."
              actionLabel="Browse today's front page"
              onAction={() => router.navigate("/")}
            />
          ) : undefined
        }
        renderItem={({ item, index }) => (
          <View
            style={[
              styles.storyRow,
              index > 0 && {
                borderTopWidth: 1,
                borderTopColor: palette.rule,
              },
            ]}
          >
            <ArticleCard article={item} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.gutter,
    paddingBottom: 40,
  },
  headerBlock: {
    paddingTop: 18,
  },
  heroHeader: {
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.6,
    marginTop: 6,
  },
  subtitle: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
  },
  ruleWrap: {
    marginTop: 24,
  },
  confirmRow: {
    alignItems: "flex-end",
    marginBottom: 8,
  },
  cancelText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    textDecorationLine: "underline",
  },
  storyRow: {
    paddingVertical: 18,
  },
});
