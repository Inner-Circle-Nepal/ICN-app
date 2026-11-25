import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { FLOAT_MS, reactionEmoji, type Floater } from "@/features/chautari/reactions";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/** How far a floater rises, and how wide its lane is. */
const RISE = 260;
const LANE = 56;

/**
 * Reactions rising from the bottom right of the room, drifting a little and
 * fading. A floater that merged several reactions is bigger and wears its
 * count ("×12"), and pops when more join it. With "reduce motion" on they
 * fade in place. Decorative: hidden from screen readers.
 */
export function ReactionLayer({ floaters, bottom }: { floaters: Floater[]; bottom: number }) {
  if (floaters.length === 0) return null;
  return (
    <View
      style={[styles.layer, { bottom }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {floaters.map((f) => (
        <FloatingReaction key={f.id} floater={f} />
      ))}
    </View>
  );
}

function FloatingReaction({ floater }: { floater: Floater }) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  // Created once per floater: a new Value per render would restart it.
  const [rise] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));
  // Which way it sways, fixed per floater.
  const [sway] = useState(() => (floater.lane < 0.5 ? -1 : 1));
  const shownCount = useRef(floater.count);

  useEffect(() => {
    const run = Animated.timing(rise, {
      toValue: 1,
      duration: FLOAT_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [rise]);

  // More of the same joined it: a quick pop.
  useEffect(() => {
    if (floater.count === shownCount.current || reduceMotion) return;
    shownCount.current = floater.count;
    pop.setValue(1.35);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start();
  }, [floater.count, pop, reduceMotion]);

  // Bigger for a crowd, within reason.
  const size = 30 + Math.min(18, Math.log2(floater.count) * 6);

  return (
    <Animated.View
      style={[
        styles.floater,
        {
          left: floater.lane * LANE,
          opacity: rise.interpolate({ inputRange: [0, 0.08, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: reduceMotion
            ? []
            : [
                { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -RISE] }) },
                {
                  translateX: rise.interpolate({
                    inputRange: [0, 0.3, 0.6, 1],
                    outputRange: [0, 10 * sway, -6 * sway, 4 * sway],
                  }),
                },
                { scale: Animated.multiply(pop, rise.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.5, 1, 0.9] })) },
              ],
        },
      ]}
    >
      <Text style={{ fontSize: size, lineHeight: size * 1.2 }}>{reactionEmoji(floater.reaction)}</Text>
      {floater.count > 1 ? (
        <View style={[styles.count, { backgroundColor: palette.ink }]}>
          <Text style={[styles.countText, { color: palette.paper }]}>×{floater.count}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", right: 14, width: LANE + 60, height: RISE + 60 },
  floater: { position: "absolute", bottom: 0, alignItems: "center" },
  count: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginTop: -4 },
  countText: { fontFamily: fontFamilies.sansMedium, fontSize: 11 },
});
