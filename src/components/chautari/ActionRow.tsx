import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

export type ActionRowProps = {
  label: string;
  onPress: () => void;
  danger?: boolean;
  muted?: boolean;
};

/** One full-width row in an action list: a person's sheet, a message's options. */
export function ActionRow({ label, onPress, danger = false, muted = false }: ActionRowProps) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.rule },
        pressed && { backgroundColor: palette.paper2 },
      ]}
    >
      <Text
        style={[
          styles.rowText,
          { color: danger ? palette.red : muted ? palette.quiet : palette.ink },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 50, justifyContent: "center", borderBottomWidth: 1 },
  rowText: { fontFamily: fontFamilies.sansRegular, fontSize: 15.5 },
});
