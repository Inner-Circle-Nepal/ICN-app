import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: ViewStyle;
}

export function SearchInput({
  value,
  onChangeText,
  onSubmit,
  placeholder = "Search headlines, topics, or नेपाली…",
  autoFocus = false,
  style,
}: SearchInputProps) {
  const { palette } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          borderBottomColor: palette.ink,
        },
        style,
      ]}
    >
      <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
        <Circle cx={11} cy={11} r={7} stroke={palette.quiet} strokeWidth={1.5} />
        <Path
          d="m16.5 16.5 4.5 4.5"
          stroke={palette.quiet}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </Svg>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={palette.quiet}
        autoFocus={autoFocus}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          {
            color: palette.ink,
          },
        ]}
        accessibilityLabel="Search stories"
      />

      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear search query"
          style={styles.clearBtn}
        >
          <Text style={[styles.clearText, { color: palette.quiet }]}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingVertical: 10,
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: fontFamilies.serifRegular,
    fontSize: 18,
    paddingVertical: 2,
  },
  clearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  clearText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
