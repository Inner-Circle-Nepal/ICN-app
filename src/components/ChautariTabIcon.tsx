import React, { useEffect, useMemo } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useReduceMotion } from "@/hooks/useReduceMotion";

/**
 * The Chautari tab icon: a voice in the middle, two rings of sound around it.
 *
 * While a room is live the rings turn red and broadcast — the inner ring
 * lights, then the outer, then both fade, on a loop — so a reader on any tab
 * can see something is happening. Readers who ask the system to reduce
 * motion get the red rings without the animation.
 *
 * Each ring is its own layer so the animation is a native opacity change,
 * not an SVG redraw on the JS thread every frame.
 */

const SIZE = 24;

export function ChautariTabIcon({
  color,
  liveColor,
  live,
}: {
  color: string;
  liveColor: string;
  live: boolean;
}) {
  const inner = useMemo(() => new Animated.Value(1), []);
  const outer = useMemo(() => new Animated.Value(1), []);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (!live || reduceMotion) {
      inner.setValue(1);
      outer.setValue(1);
      return;
    }
    const step = (v: Animated.Value, to: number, duration: number) =>
      Animated.timing(v, {
        toValue: to,
        duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    inner.setValue(0.15);
    outer.setValue(0.1);
    const loop = Animated.loop(
      Animated.sequence([
        step(inner, 1, 350),
        step(outer, 1, 350),
        Animated.delay(250),
        Animated.parallel([step(inner, 0.15, 450), step(outer, 0.1, 450)]),
        Animated.delay(200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, reduceMotion, inner, outer]);

  const ring = live ? liveColor : color;

  return (
    <View style={styles.box}>
      <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" style={StyleSheet.absoluteFill}>
        <Circle
          cx={12}
          cy={12}
          r={2.5}
          stroke={ring}
          strokeWidth={1.7}
          fill={live ? liveColor : "none"}
        />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: inner }]}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
          <Path
            d="M7.5 8.5a6 6 0 0 0 0 7M16.5 8.5a6 6 0 0 1 0 7"
            stroke={ring}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: outer }]}>
        <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4.5 5.5a10 10 0 0 0 0 13M19.5 5.5a10 10 0 0 1 0 13"
            stroke={ring}
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={live ? 1 : 0.55}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE },
});
