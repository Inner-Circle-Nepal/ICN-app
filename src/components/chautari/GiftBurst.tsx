import React, { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { giftArt } from "@/features/chautari/gifts";
import { GIFT_SHOW_MS, type ShownGift } from "@/features/chautari/useRoomGifts";
import { useTheme } from "@/hooks/useTheme";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { fontFamilies } from "@/theme/tokens";

/**
 * One gift, shown to the whole room: a card rises above the controls, the
 * gift pops in, and a few copies of it float up and fade. Mounted per gift
 * (keyed by the caller), so every gift plays from the start. With "reduce
 * motion" on, the card only fades in and out.
 */

/** Where the floating copies start (px from centre), their delay and height. */
const FLOATERS = [
  { x: -70, delay: 0, rise: 150 },
  { x: -32, delay: 140, rise: 190 },
  { x: 6, delay: 60, rise: 170 },
  { x: 40, delay: 220, rise: 200 },
  { x: 74, delay: 100, rise: 160 },
];

const ENTER_MS = 260;
const EXIT_MS = 300;

export function GiftBurst({ gift }: { gift: ShownGift }) {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  // Created once per gift: a fresh Value per render would restart the animation.
  const [card] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(0));
  const [floaters] = useState(() => FLOATERS.map(() => new Animated.Value(0)));

  useEffect(() => {
    const hold = GIFT_SHOW_MS - ENTER_MS - EXIT_MS;
    const cardIn = Animated.timing(card, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const cardOut = Animated.timing(card, {
      toValue: 2,
      duration: EXIT_MS,
      delay: hold,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });

    if (reduceMotion) {
      const run = Animated.sequence([cardIn, cardOut]);
      run.start();
      return () => run.stop();
    }

    const run = Animated.parallel([
      Animated.sequence([cardIn, cardOut]),
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
      ]),
      Animated.parallel(
        floaters.map((v, i) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 1500,
            delay: 200 + FLOATERS[i].delay,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ),
      ),
    ]);
    run.start();
    return () => run.stop();
  }, [card, pop, floaters, reduceMotion]);

  const art = giftArt(gift.packet.giftId);
  const cardStyle = {
    opacity: card.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
    transform: reduceMotion
      ? []
      : [{ translateY: card.interpolate({ inputRange: [0, 1, 2], outputRange: [24, 0, -10] }) }],
  };

  return (
    // Hidden from screen readers: useRoomGifts announces each gift instead.
    <View
      style={styles.wrap}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {reduceMotion
        ? null
        : floaters.map((v, i) => (
            <Animated.Text
              key={i}
              style={[
                styles.floater,
                {
                  opacity: v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.8, 0] }),
                  transform: [
                    { translateX: FLOATERS[i].x },
                    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -FLOATERS[i].rise] }) },
                    { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.15] }) },
                  ],
                },
              ]}
            >
              {art}
            </Animated.Text>
          ))}

      <Animated.View style={[styles.card, { backgroundColor: palette.ink }, cardStyle]}>
        <Animated.Text
          style={[
            styles.art,
            reduceMotion
              ? null
              : {
                  transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
                },
          ]}
        >
          {art}
        </Animated.Text>
        <View style={styles.words}>
          <Text style={[styles.line, { color: palette.paper }]} numberOfLines={1}>
            <Text style={styles.by}>{gift.packet.by}</Text> sent a {gift.packet.name}
          </Text>
          {gift.packet.nameNe ? (
            <Text style={[styles.ne, { color: palette.paper }]} numberOfLines={1}>
              {gift.packet.nameNe}
            </Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginBottom: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "88%",
    paddingLeft: 10,
    paddingRight: 16,
    paddingVertical: 8,
    borderRadius: 26,
  },
  art: { fontSize: 30, lineHeight: 36 },
  words: { flexShrink: 1 },
  line: { fontFamily: fontFamilies.sansRegular, fontSize: 14 },
  by: { fontFamily: fontFamilies.sansMedium },
  ne: { fontFamily: fontFamilies.sansRegular, fontSize: 12, opacity: 0.7, marginTop: 1 },
  floater: { position: "absolute", bottom: 10, fontSize: 26 },
});
