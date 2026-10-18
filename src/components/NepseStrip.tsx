import React from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import type { NepseIndexReading } from "@/types/domain";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import {
  formatPercent,
  formatPrice,
  isFromCurrentSession,
  marketDateLabel,
  marketTimeLabel,
} from "@/utils/format";

/**
 * Homepage NEPSE Index strip.
 *
 * Mirrors `site/src/components/widgets/NepseStripView.tsx`:
 *   - Displays the headline NEPSE Index, percentage move, and market session state
 *   - Tapping opens the NEPSE category screen with the full market board
 */

interface NepseStripProps {
  reading: NepseIndexReading;
  style?: ViewStyle;
}

export function NepseStrip({ reading, style }: NepseStripProps) {
  const router = useRouter();
  const { palette } = useTheme();
  const { index, isOpen } = reading;

  if (!index) return null;

  const at = marketTimeLabel(index.generatedAt);
  const current = isFromCurrentSession(index.generatedAt);
  const on = current ? null : marketDateLabel(index.generatedAt);

  const moveColor =
    index.change > 0
      ? palette.marketUp
      : index.change < 0
        ? palette.red
        : palette.quiet;

  return (
    <Pressable
      onPress={() => router.push("/category/nepse")}
      accessibilityRole="link"
      accessibilityLabel={`NEPSE Index ${formatPrice(index.close)}, ${formatPercent(index.percentChange)}. Tap to open market board.`}
      style={({ pressed }) => [
        styles.container,
        {
          borderTopColor: palette.rule,
          borderBottomColor: palette.rule,
          backgroundColor: pressed ? palette.paper2 : "transparent",
        },
        style,
      ]}
    >
      <View style={styles.leftGroup}>
        <Text style={[styles.kicker, { color: palette.ink }]}>NEPSE</Text>
        <Text style={[styles.price, { color: palette.ink }]}>
          {formatPrice(index.close)}
        </Text>
        <Text style={[styles.percent, { color: moveColor }]}>
          {formatPercent(index.percentChange)}
        </Text>
      </View>

      <Text style={[styles.statusMeta, { color: palette.quiet }]}>
        {!current ? "Last session" : isOpen ? "Trading" : "Closed"}
        {at ? ` · ${at}` : ""}
        {on ? ` ${on}` : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 12,
    gap: 8,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  price: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 21,
    fontVariant: ["tabular-nums"],
  },
  percent: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  statusMeta: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
  },
});
