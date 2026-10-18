import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { spacing } from "@/theme/tokens";

/**
 * Restrained broadsheet loading skeletons.
 *
 * Uses subtle paper-2 blocks and hairlines that mirror the actual editorial
 * layout (lead story, wire list, or article body).
 */

function PulseBlock({
  height,
  width = "100%",
  style,
}: {
  height: number;
  width?: number | `${number}%`;
  style?: ViewStyle;
}) {
  const { palette } = useTheme();
  // Lazy `useState`, not `useRef(...).current` — created once, and not read
  // out of a ref during render.
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          backgroundColor: palette.paper2,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function HomeLoadingSkeleton() {
  const { palette } = useTheme();

  return (
    <View style={styles.container} accessibilityLabel="Loading stories">
      <PulseBlock height={10} width="26%" style={styles.mb10} />
      <PulseBlock height={32} width="94%" style={styles.mb8} />
      <PulseBlock height={32} width="72%" style={styles.mb16} />
      <PulseBlock height={195} width="100%" style={styles.mb16} />
      <PulseBlock height={18} width="96%" style={styles.mb8} />
      <PulseBlock height={18} width="82%" style={styles.mb12} />
      <PulseBlock height={12} width="40%" />

      <View style={[styles.rule, { backgroundColor: palette.rule }]} />

      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.listRow,
            i > 0 && { borderTopWidth: 1, borderTopColor: palette.rule },
          ]}
        >
          <PulseBlock height={10} width="22%" style={styles.mb8} />
          <PulseBlock height={22} width="90%" style={styles.mb8} />
          <PulseBlock height={22} width="64%" style={styles.mb10} />
          <PulseBlock height={12} width="36%" />
        </View>
      ))}
    </View>
  );
}

export function ArticleLoadingSkeleton() {
  const { palette } = useTheme();

  return (
    <View style={styles.container} accessibilityLabel="Loading article">
      <PulseBlock height={11} width="25%" style={styles.mb12} />
      <PulseBlock height={34} width="95%" style={styles.mb8} />
      <PulseBlock height={34} width="84%" style={styles.mb8} />
      <PulseBlock height={34} width="55%" style={styles.mb16} />

      <PulseBlock height={20} width="92%" style={styles.mb8} />
      <PulseBlock height={20} width="76%" style={styles.mb16} />

      <View
        style={[
          styles.bylineBox,
          { borderColor: palette.rule },
        ]}
      >
        <PulseBlock height={13} width="48%" style={styles.mb8} />
        <PulseBlock height={12} width="62%" />
      </View>

      <PulseBlock height={210} width="100%" style={styles.mb24} />

      {[0, 1, 2, 3].map((p) => (
        <View key={p} style={styles.mb20}>
          <PulseBlock height={17} width="98%" style={styles.mb8} />
          <PulseBlock height={17} width="94%" style={styles.mb8} />
          <PulseBlock height={17} width="96%" style={styles.mb8} />
          <PulseBlock height={17} width="70%" />
        </View>
      ))}
    </View>
  );
}

export function ListLoadingSkeleton({ count = 4 }: { count?: number }) {
  const { palette } = useTheme();

  return (
    <View style={styles.container} accessibilityLabel="Loading story list">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.listRow,
            i > 0 && { borderTopWidth: 1, borderTopColor: palette.rule },
          ]}
        >
          <PulseBlock height={10} width="24%" style={styles.mb8} />
          <PulseBlock height={22} width="92%" style={styles.mb8} />
          <PulseBlock height={22} width="68%" style={styles.mb10} />
          <PulseBlock height={12} width="38%" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 18,
    paddingBottom: 28,
  },
  rule: {
    height: 1,
    width: "100%",
    marginVertical: 22,
  },
  listRow: {
    paddingVertical: 16,
  },
  bylineBox: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 14,
    marginBottom: 20,
  },
  mb8: { marginBottom: 8 },
  mb10: { marginBottom: 10 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
  mb20: { marginBottom: 20 },
  mb24: { marginBottom: 24 },
});
