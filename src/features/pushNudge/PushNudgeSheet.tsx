import React, { useEffect, useMemo } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { usePathname } from "expo-router";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { usePushNudge } from "./context";

/**
 * Contextual soft-ask for push permission.
 *
 * Mounts once at app root, reads the nudge context, and renders only
 * when both `pendingSheet` is true and the current route is one of the
 * five tab routes — so the sheet never covers an article or a Chautari
 * room the reader is actively using.
 *
 * Copy is bilingual (short Nepali invitation + English clarifier),
 * leaning on the warmth the brand asks for ("तपाईंलाई खबर दिऔँ?" rather
 * than "Enable notifications").
 */

const TAB_ROUTES = new Set(["/", "/explore", "/chautari", "/bookmarks", "/settings"]);

export function PushNudgeSheet() {
  const { palette } = useTheme();
  const { pendingSheet, acceptNudge, declineNudge } = usePushNudge();
  const pathname = usePathname();

  const visible = pendingSheet && TAB_ROUTES.has(pathname);

  const slide = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (!visible) return;
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  if (!visible) return null;

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [240, 0],
  });

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => void declineNudge()}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => void declineNudge()}
        accessibilityLabel="Dismiss"
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: palette.paper,
            borderTopColor: palette.ink,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: palette.rule2 }]} />
        <Text style={[styles.kicker, { color: palette.quiet }]}>
          Stay with the newsroom
        </Text>
        <Text style={[styles.titleNe, { color: palette.ink }]}>
          तपाईंलाई खबर दिऔँ?
        </Text>
        <Text style={[styles.titleEn, { color: palette.ink2 }]}>
          Let us tell you when something matters.
        </Text>
        <Text style={[styles.body, { color: palette.quiet }]}>
          Breaking dispatches, live Chautari rooms, and a light weekly nudge —
          nothing more. You can turn each one on or off in Settings.
        </Text>

        <Pressable
          onPress={() => void acceptNudge()}
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.ink, borderColor: palette.ink },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Enable notifications"
        >
          <Text style={[styles.primaryBtnText, { color: palette.paper }]}>
            सक्रिय गर्नुहोस् · Enable
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void declineNudge()}
          style={styles.secondaryBtn}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        >
          <Text style={[styles.secondaryBtnText, { color: palette.ink2 }]}>
            पछि · Not now
          </Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 2,
  },
  grabber: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  titleNe: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 28,
    lineHeight: 34,
    marginTop: 8,
  },
  titleEn: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 4,
  },
  body: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 12,
  },
  primaryBtn: {
    marginTop: 20,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
