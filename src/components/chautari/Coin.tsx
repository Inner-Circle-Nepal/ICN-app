import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * Chautari's coin, drawn rather than bundled so it stays sharp at any size.
 * Gold in both themes: it's an object, like the gift emoji, not ink.
 */

const FACE = "#E9B949";
const RIM = "#B7841F";
const SHINE = "#F6DA8A";

/** One coin, face on: for balances and prices. */
export function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={12} cy={12} r={10.5} fill={FACE} stroke={RIM} strokeWidth={1.5} />
      <Circle cx={12} cy={12} r={6.8} fill="none" stroke={RIM} strokeWidth={1.1} />
      <Path d="M9.2 8.6a4.6 4.6 0 0 1 3.6-1.3" stroke={SHINE} strokeWidth={1.3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** A coin seen from the side, `y` = top of its face. */
function SideCoin({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Path d={`M${x - 9} ${y}v3.2a9 3.4 0 0 0 18 0V${y}`} fill={RIM} />
      <Ellipse cx={x} cy={y} rx={9} ry={3.4} fill={FACE} stroke={RIM} strokeWidth={1.1} />
      <Ellipse cx={x} cy={y} rx={5.2} ry={1.8} fill="none" stroke={RIM} strokeWidth={0.8} />
    </G>
  );
}

/**
 * A pack's picture: one coin, a stack, or a pile, by the pack's place in the
 * shop (0 = smallest) rather than its product id, so any pack gets one.
 */
export function CoinPile({ level, size = 44 }: { level: number; size?: number }) {
  const tier = Math.max(0, Math.min(2, level));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 44 44">
        {tier === 0 ? (
          <G>
            <Circle cx={22} cy={22} r={13} fill={FACE} stroke={RIM} strokeWidth={1.6} />
            <Circle cx={22} cy={22} r={8.4} fill="none" stroke={RIM} strokeWidth={1.2} />
            <Path d="M18.6 16.8a5.7 5.7 0 0 1 4.4-1.6" stroke={SHINE} strokeWidth={1.5} strokeLinecap="round" fill="none" />
          </G>
        ) : tier === 1 ? (
          <G>
            {[33, 28, 23, 18, 13].map((y) => (
              <SideCoin key={y} x={22} y={y} />
            ))}
          </G>
        ) : (
          <G>
            {[35, 30, 25].map((y) => (
              <SideCoin key={`l${y}`} x={12} y={y} />
            ))}
            {[35, 30, 25, 20, 15, 10].map((y) => (
              <SideCoin key={`r${y}`} x={31} y={y} />
            ))}
          </G>
        )}
      </Svg>
    </View>
  );
}

/** The reader's balance: a coin and the number, test coins after it in grey. */
export function CoinBalance({ coins, testCoins = 0 }: { coins: number; testCoins?: number }) {
  const { palette } = useTheme();
  return (
    <View
      style={balanceStyles.row}
      accessible
      accessibilityLabel={`Your balance: ${coins} coins${testCoins > 0 ? `, ${testCoins} of them test coins` : ""}`}
    >
      <CoinIcon size={18} />
      <Text style={[balanceStyles.amount, { color: palette.ink }]}>{coins.toLocaleString()}</Text>
      {testCoins > 0 ? (
        <Text style={[balanceStyles.test, { color: palette.quiet }]}>
          ({testCoins.toLocaleString()} test)
        </Text>
      ) : null}
    </View>
  );
}

const balanceStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  amount: { fontFamily: fontFamilies.sansMedium, fontSize: 15 },
  test: { fontFamily: fontFamilies.sansRegular, fontSize: 13 },
});
