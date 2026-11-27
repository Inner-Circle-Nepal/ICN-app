import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { HandIcon } from "./RoomIcons";

/**
 * A listener's raise-hand button, whose look is the feedback: no message to
 * read or dismiss.
 *
 *   down    outlined hand
 *   raised  solid red with a white hand that waves once when raised, and a
 *           ring pulsing out from the button for as long as the hand is up,
 *           so "I'm waiting to speak" stays visible at a glance
 *
 * Screen readers hear "Hand raised" / "Hand lowered" instead.
 */
export function HandButton({
  raised,
  busy,
  disabled,
  onPress,
}: {
  raised: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  const [wave] = useState(() => new Animated.Value(0));

  // The ring: out and fading, over and over, only while the hand is up.
  useEffect(() => {
    if (!raised) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [raised, pulse]);

  // One wave when the hand goes up, and the announcement either way.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(raised ? "Hand raised" : "Hand lowered");
    if (!raised) return;
    wave.setValue(0);
    Animated.timing(wave, {
      toValue: 1,
      duration: 700,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [raised, wave]);

  const rotate = wave.interpolate({
    inputRange: [0, 0.2, 0.45, 0.7, 1],
    outputRange: ["0deg", "-18deg", "14deg", "-8deg", "0deg"],
  });

  return (
    <View style={styles.wrap}>
      {raised ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              borderColor: palette.red,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
            },
          ]}
        />
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={raised ? "Lower your hand" : "Raise your hand to speak"}
        accessibilityState={{ selected: raised, disabled }}
        style={({ pressed }) => [
          styles.round,
          {
            borderColor: raised ? palette.red : palette.rule2,
            backgroundColor: raised ? palette.red : "transparent",
            opacity: disabled && !busy ? 0.4 : 1,
          },
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={raised ? "#ffffff" : palette.ink} />
        ) : (
          <Animated.View style={{ transform: [{ rotate }] }}>
            <HandIcon size={24} color={raised ? "#ffffff" : palette.ink} />
          </Animated.View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
});
