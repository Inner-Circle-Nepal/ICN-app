import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { initialsFor } from "@/features/chautari/initials";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * A participant, drawn from the only thing the API gives us: their name.
 *
 * There is no avatar URL anywhere in the Chautari payloads — not in
 * `/api/chautari/discover`, not in the join grant, and no column for one in
 * `chautari_participants`. So this is initials set in the masthead serif on
 * the paper tone, which is a deliberate choice rather than a placeholder: it
 * needs no network, cannot pop in late, and looks the same on a cold start
 * as it does warm. Photographs are [needs API].
 *
 * The ring is the one piece of state it carries, and it is never decorative —
 * the caller passes `speaking` straight from LiveKit's own audio activity.
 */

export type AvatarSize = "sm" | "md" | "lg";

const DIMENSIONS: Record<AvatarSize, { box: number; type: number }> = {
  sm: { box: 34, type: 14 },
  md: { box: 46, type: 18 },
  lg: { box: 58, type: 23 },
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
   * A real photograph, when one exists.
   *
   * Only the signed-in reader's own picture is available — Clerk exposes
   * `imageUrl` for the current user and nothing equivalent for the other
   * people in a room, so Chautari participants stay on initials until the
   * backend carries avatars. Pass `null` rather than Clerk's generated
   * placeholder: `user.hasImage` is the flag that distinguishes the two.
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
