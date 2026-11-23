import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * Every error the app shows, in one style: a red warning mark, the message in
 * plain words (the reason matters, so it stays text), an optional action, and
 * a × to close it where closing makes sense.
 *
 *   block    (default) tinted panel with a red rule: room and page errors
 *   compact  mark and text only: under a field, above the chat composer
 *
 * Confirmations are toasts (components/Toast.tsx), not this.
 */
export function ErrorMessage({
  message,
  onDismiss,
  action,
  compact = false,
  style,
}: {
  message: string;
  /** Shows a × that closes it. Leave out for errors that clear on retry. */
  onDismiss?: () => void;
  /** One thing the reader can do about it, e.g. "Open settings". */
  action?: { label: string; onPress: () => void };
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.row,
        compact
          ? styles.compact
          : [styles.block, { backgroundColor: palette.paper2, borderLeftColor: palette.red }],
        style,
      ]}
    >
      <WarningMark color={palette.red} size={compact ? 16 : 18} />
      <View style={styles.body}>
        <Text style={[compact ? styles.compactText : styles.text, { color: palette.ink }]}>
          {message}
        </Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={8}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text style={[styles.actionText, { color: palette.red }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close this message"
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6l12 12M18 6L6 18" stroke={palette.quiet} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </Pressable>
      ) : null}
    </View>
  );
}

function WarningMark({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={styles.mark}>
      <Circle cx={12} cy={12} r={10} fill={color} />
      <Path d="M12 7v6.5" stroke="#ffffff" strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={12} cy={17} r={1.4} fill="#ffffff" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  block: { borderLeftWidth: 3, paddingVertical: 10, paddingLeft: 12, paddingRight: 10, marginTop: 14 },
  compact: { paddingVertical: 4, marginTop: 6 },
  mark: { marginTop: 1 },
  body: { flex: 1 },
  text: { fontFamily: fontFamilies.sansRegular, fontSize: 14, lineHeight: 20 },
  compactText: { fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 18 },
  action: { marginTop: 6, alignSelf: "flex-start" },
  actionText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  close: { paddingTop: 2 },
  pressed: { opacity: 0.6 },
});
