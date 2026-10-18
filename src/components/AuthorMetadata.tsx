import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { Article } from "@/types/domain";
import { useTheme } from "@/hooks/useTheme";
import { site } from "@/constants/site";
import { fontFamilies } from "@/theme/tokens";
import { formatDateTime } from "@/utils/format";

/**
 * Rule-bounded byline band and reporter bio block for the article reading view.
 *
 * Mirrors `site/src/app/(site)/[category]/[slug]/page.tsx`.
 */

export function ArticleBylineBand({
  article,
  style,
}: {
  article: Article;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  const updated =
    article.updated_at && article.updated_at !== article.published_at
      ? article.updated_at
      : null;

  const authorRoleAndLoc = article.author
    ? [article.author.role, article.author.location].filter(Boolean).join(", ")
    : "";

  return (
    <View
      style={[
        styles.bylineBand,
        { borderTopColor: palette.rule, borderBottomColor: palette.rule },
        style,
      ]}
    >
      <View style={styles.authorLine}>
        {article.author ? (
          <Text style={[styles.metaText, { color: palette.quiet }]}>
            <Text style={[styles.authorName, { color: palette.ink }]}>
              {article.author.name}
            </Text>
            {authorRoleAndLoc ? `  ${authorRoleAndLoc}` : ""}
          </Text>
        ) : (
          <Text style={[styles.metaText, { color: palette.quiet }]}>
            {site.name} newsroom
          </Text>
        )}
      </View>

      <Text style={[styles.metaText, { color: palette.quiet }]}>
        {formatDateTime(article.published_at, "Asia/Kathmandu")} NPT
        {updated ? `  ·  Updated ${formatDateTime(updated, "Asia/Kathmandu")}` : ""}
        {`  ·  ${article.reading_minutes} min read`}
      </Text>
    </View>
  );
}

export function AuthorBioCard({
  article,
  style,
}: {
  article: Article;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();

  if (!article.author?.bio) return null;

  return (
    <View
      style={[
        styles.bioContainer,
        { borderTopColor: palette.ink },
        style,
      ]}
    >
      <Text style={[styles.kicker, { color: palette.ink }]}>About the reporter</Text>
      <Text style={[styles.bioName, { color: palette.ink }]}>
        {article.author.name}
      </Text>
      <Text style={[styles.bioCopy, { color: palette.quiet }]}>
        {article.author.bio}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bylineBand: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 14,
    gap: 6,
  },
  authorLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
  },
  authorName: {
    fontFamily: fontFamilies.sansMedium,
    fontWeight: "500",
    fontSize: 12.5,
  },
  metaText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 18,
  },
  bioContainer: {
    borderTopWidth: 1,
    paddingTop: 18,
    marginTop: 28,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  bioName: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 20,
    marginTop: 10,
  },
  bioCopy: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15.5,
    lineHeight: 24,
    marginTop: 6,
  },
});
