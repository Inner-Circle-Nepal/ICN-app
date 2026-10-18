import React from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * Broadsheet section heading: a tracked uppercase kicker sitting under a
 * full-width ink rule, with an optional right-aligned CTA link or status label.
 *
 * Mirrors `SectionRule` in `site/src/components/brand/Logo.tsx`.
 */

interface SectionRuleProps {
  title: string;
  cta?: string;
  onPressCta?: () => void;
  style?: ViewStyle;
}

export function SectionRule({
  title,
  cta,
  onPressCta,
  style,
}: SectionRuleProps) {
  const { palette } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { borderTopColor: palette.ink },
        style,
      ]}
    >
      <Text
        style={[styles.kicker, { color: palette.ink }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View style={styles.spacer} />
      {cta && onPressCta ? (
        <Pressable
          onPress={onPressCta}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`${cta} — ${title}`}
        >
          <Text style={[styles.cta, { color: palette.quiet }]}>{cta} →</Text>
        </Pressable>
      ) : cta ? (
        <Text style={[styles.cta, { color: palette.quiet }]}>{cta}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "baseline",
    borderTopWidth: 1,
    paddingTop: 10,
    marginBottom: 16,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  spacer: {
    flex: 1,
    minWidth: 12,
  },
  cta: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
  },
});
