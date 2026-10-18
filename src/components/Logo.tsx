import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/hooks/useTheme";
import { brandColors, fontFamilies } from "@/theme/tokens";

/**
 * The ICN mark (`Monogram`, `Wordmark`, `Logo`).
 *
 * Recreates the exact geometry from `site/src/components/brand/Logo.tsx`:
 *   - Ring: r=26 in a 64x64 viewBox, strokeWidth=1.5, 15-unit gap at ~-10°
 *   - Red dot (#db0a12) at -10° on the ring radius (r=4.4)
 *   - "ICN" centered at (30, 32.5)
 *   - Wordmark: "INNER CIRCLE NEPAL" with "NEPAL" in #db0a12
 */

const R = 26;
const CIRC = 2 * Math.PI * R;
const GAP = 15;
const DOT_A = -10 * (Math.PI / 180);
const DOT_CX = 32 + R * Math.cos(DOT_A);
const DOT_CY = 32 + R * Math.sin(DOT_A);

export function Monogram({
  size = 32,
  color,
}: {
  size?: number;
  color?: string;
}) {
  const { palette } = useTheme();
  const strokeColor = color ?? palette.ink;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      accessibilityRole="image"
      accessibilityLabel="ICN monogram"
    >
      <Circle
        cx={32}
        cy={32}
        r={R}
        stroke={strokeColor}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeDasharray={`${CIRC - GAP} ${GAP}`}
        rotation={6.5}
        origin="32, 32"
      />
      <SvgText
        x={30}
        y={36.5}
        textAnchor="middle"
        fill={strokeColor}
        fontFamily={fontFamilies.sansMedium}
        fontSize={15.5}
        fontWeight="500"
        letterSpacing={1.2}
      >
        ICN
      </SvgText>
      <Circle cx={DOT_CX} cy={DOT_CY} r={4.4} fill={brandColors.icn700} />
    </Svg>
  );
}

export function Wordmark({
  size = "sm",
}: {
  size?: "sm" | "lg";
}) {
  const { palette } = useTheme();
  const isLg = size === "lg";

  return (
    <Text
      style={[
        styles.wordmark,
        {
          color: palette.ink,
          fontSize: isLg ? 15 : 12,
          letterSpacing: isLg ? 3.8 : 2.8,
        },
      ]}
      numberOfLines={1}
    >
      INNER CIRCLE <Text style={{ color: palette.red }}>NEPAL</Text>
    </Text>
  );
}

export function Logo({
  size = "sm",
  style,
}: {
  size?: "sm" | "lg";
  style?: ViewStyle;
}) {
  const isLg = size === "lg";
  return (
    <View
      style={[
        styles.logoRow,
        { gap: isLg ? 12 : 9 },
        style,
      ]}
      accessibilityRole="header"
      accessibilityLabel="Inner Circle Nepal — Beyond the Headlines"
    >
      <Monogram size={isLg ? 38 : 30} />
      <Wordmark size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmark: {
    fontFamily: fontFamilies.sansMedium,
    fontWeight: "500",
    textTransform: "uppercase",
  },
});
