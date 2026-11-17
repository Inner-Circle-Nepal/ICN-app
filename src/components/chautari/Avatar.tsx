import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { initialsFor } from "@/features/chautari/initials";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * A participant: their photograph when the room carries one, otherwise their
 * initials set in the masthead serif on the paper tone. Initials need no
 * network and cannot pop in late, so they are also what a slow or failed
 * image load falls back to.
 *
 * The ring is the one piece of state it carries, and it is never decorative —
 * the caller passes `speaking` straight from LiveKit's own audio activity.
 */

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const DIMENSIONS: Record<AvatarSize, { box: number; type: number }> = {
  sm: { box: 34, type: 14 },
  md: { box: 46, type: 18 },
  lg: { box: 58, type: 23 },
  xl: { box: 72, type: 28 },
};

export function Avatar({
  name,
  size = "md",
  speaking = false,
  imageUrl = null,
}: {
  name: string;
  size?: AvatarSize;
  /** LiveKit's own `isSpeaking`, already combined with "not muted". */
  speaking?: boolean;
  /**
   * A real photograph, when one exists. Pass `null` rather than Clerk's
   * generated placeholder: `user.hasImage` distinguishes the two.
   */
  imageUrl?: string | null;
}) {
  const { palette } = useTheme();
  const { box, type } = DIMENSIONS[size];

  return (
    <View
      /*
       * The border is always 2px and only changes colour, so a participant
       * does not shift by two pixels the moment they start talking.
       */
      style={[
        styles.base,
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          backgroundColor: palette.paper2,
          borderColor: speaking ? palette.red : palette.rule,
        },
      ]}
      /* The name is already announced by the row or tile that owns this. */
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: box - 4, height: box - 4, borderRadius: (box - 4) / 2 }}
          contentFit="cover"
          /* Initials stay underneath as the placeholder, so a slow or failed
             fetch degrades to the same mark rather than to an empty circle. */
          transition={120}
          cachePolicy="memory-disk"
        />
      ) : (
        <Text style={[styles.initials, { color: palette.ink2, fontSize: type }]}>
          {initialsFor(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: fontFamilies.serifMedium,
    includeFontPadding: false,
  },
});
