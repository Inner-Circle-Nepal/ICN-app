import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * Editorial section item used in the horizontal masthead section bar and
 * discovery tabs.
 *
 * Follows the house rule: no coloured pill backgrounds or rounded boxes —
 * tracked uppercase sans (`kicker`) with an ink underline when active.
 */

interface CategoryChipProps {
  name: string;
  nameNe?: string | null;
  active?: boolean;
  isLocked?: boolean;
  onPress: () => void;
}

export function CategoryChip({
  name,
  nameNe,
  active = false,
  onPress,
}: CategoryChipProps) {
  const { palette, language } = useTheme();
  const label = language === "ne" && nameNe ? nameNe : name;
  const isNe = language === "ne" && Boolean(nameNe);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={name}
      style={styles.pressable}
    >
      <Text
        style={[
          isNe ? styles.devaLabel : styles.kickerLabel,
          {
            color: active ? palette.ink : palette.quiet,
          },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.underline,
          {
            backgroundColor: active ? palette.ink : "transparent",
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    paddingVertical: 10,
    marginRight: 22,
    justifyContent: "center",
  },
  kickerLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  devaLabel: {
    fontFamily: fontFamilies.devaMedium,
    fontSize: 13,
    fontWeight: "500",
  },
  underline: {
    height: 1.5,
    marginTop: 5,
    width: "100%",
  },
});
