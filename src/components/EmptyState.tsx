import React from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";

interface EmptyStateProps {
  kicker?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function EmptyState({
  kicker = "Inner Circle Nepal",
  title,
  description,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const { palette } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.kicker, { color: palette.red }]}>{kicker}</Text>
      <Text style={[styles.title, { color: palette.ink }]}>{title}</Text>
      <Text style={[styles.description, { color: palette.quiet }]}>
        {description}
      </Text>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.ink },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, { color: palette.paper }]}>
            {actionLabel}
          </Text>
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
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
    marginTop: 10,
  },
  description: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16.5,
    lineHeight: 25,
    marginTop: 12,
  },
  button: {
    marginTop: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  pressed: {
    opacity: 0.8,
  },
});
