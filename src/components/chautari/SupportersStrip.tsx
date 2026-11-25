import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import type { GiftPerson } from "@/lib/api/chautari";
import { fontFamilies } from "@/theme/tokens";
import { Avatar } from "./Avatar";

/** How many faces show before the count says the rest. */
const FACES = 3;

/**
 * Who has supported this room, as faces: the first few supporters' pictures,
 * overlapping, then the count. Tapping opens the supporters sheet. No
 * amounts, as everywhere outside the host's own view.
 */
export function SupportersStrip({
  supporters,
  onPress,
}: {
  supporters: GiftPerson[];
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const count = supporters.length;
  if (count === 0) return null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Supporters: ${count} ${count === 1 ? "person has" : "people have"} sent gifts`}
      hitSlop={6}
      style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
    >
      <View style={styles.faces}>
        {supporters.slice(0, FACES).map((person, i) => (
          <View
            key={person.username ?? `face-${i}`}
            // A ring of paper separates each face from the one it overlaps.
            style={[
              styles.face,
              { borderColor: palette.paper, zIndex: FACES - i },
              i > 0 && styles.overlap,
            ]}
          >
            <Avatar name={person.name} size="sm" imageUrl={person.avatarUrl} />
          </View>
        ))}
      </View>
      <Text style={[styles.label, { color: palette.ink }]}>
        {count} {count === 1 ? "supporter" : "supporters"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 10, marginTop: 12 },
  pressed: { opacity: 0.6 },
  faces: { flexDirection: "row" },
  face: { borderWidth: 2, borderRadius: 19 },
  overlap: { marginLeft: -12 },
  label: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
});
