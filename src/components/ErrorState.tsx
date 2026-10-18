import React from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { timeAgo } from "@/utils/format";

/**
 * ErrorState and CachedBanner components.
 *
 * Explicitly distinguishes cached content served during a network failure from
 * unrecoverable initial request failures (Requirement 5H).
 */

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export function ErrorState({
  title = "Unable to reach the newsroom",
  message = "We couldn’t load this page right now. Check your connection and try again.",
  onRetry,
  style,
}: ErrorStateProps) {
  const { palette } = useTheme();

  return (
    <View style={[styles.container, style]} accessibilityRole="alert">
      <Text style={[styles.kicker, { color: palette.red }]}>Connection issue</Text>
      <Text style={[styles.title, { color: palette.ink }]}>{title}</Text>
      <Text style={[styles.message, { color: palette.quiet }]}>{message}</Text>

      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading content"
          style={({ pressed }) => [
            styles.retryBtn,
            { backgroundColor: palette.ink },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.retryText, { color: palette.paper }]}>
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function CachedNoticeBanner({
  updatedAt,
  onRetry,
}: {
  updatedAt?: number | string;
  onRetry?: () => void;
}) {
  const { palette } = useTheme();
  const stamp = updatedAt ? timeAgo(new Date(updatedAt)) : null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: palette.paper2,
          borderBottomColor: palette.rule,
          borderLeftColor: palette.red,
        },
      ]}
      accessibilityRole="alert"
    >
      <Text style={[styles.bannerText, { color: palette.ink2 }]}>
        Offline or unstable connection — showing cached edition
        {stamp ? ` (${stamp})` : ""}.
      </Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Text style={[styles.bannerRetry, { color: palette.ink }]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.gutter,
    paddingVertical: 48,
    alignItems: "flex-start",
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 27,
    lineHeight: 32,
    letterSpacing: -0.4,
    marginTop: 10,
  },
  message: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
  },
  retryBtn: {
    marginTop: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  pressed: {
    opacity: 0.8,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.gutter,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    gap: 12,
  },
  bannerText: {
    flex: 1,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 17,
  },
  bannerRetry: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    textTransform: "uppercase",
    letterSpacing: 1,
    textDecorationLine: "underline",
  },
});
