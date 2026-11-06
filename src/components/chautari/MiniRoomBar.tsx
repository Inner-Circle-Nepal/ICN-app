import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useActiveRoom } from "@/features/chautari/ActiveRoom";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";

/**
 * "You are still in a room": shown on every other screen while a Chautari
 * room is live, so leaving the room screen never silently leaves the room.
 * Tap to go back in; Leave disconnects.
 */
export function MiniRoomBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { palette } = useTheme();
  const { active, room, leave } = useActiveRoom();

  if (!active || !room) return null;
  const inProgress =
    room.phase === "requesting" ||
    room.phase === "connecting" ||
    room.phase === "connected" ||
    room.phase === "reconnecting";
  if (!inProgress) return null;
  if (decodeURIComponent(pathname) === `/chautari/${active.slug}`) return null;

  const title = room.identity?.title ?? active.hintedTitle ?? "Chautari";
  const status =
    room.phase === "connected"
      ? room.canPublish
        ? room.micEnabled
          ? "You're live"
          : "On stage · muted"
        : `Listening · ${room.members.length} in the room`
      : room.phase === "reconnecting"
        ? "Reconnecting…"
        : "Joining…";

  const open = () =>
    router.push({
      pathname: "/chautari/[slug]",
      params: { slug: active.slug, title, host: active.hintedHost ?? "" },
    });

  return (
    <View style={[styles.bar, { backgroundColor: palette.ink }]}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`Return to ${title}. ${status}.`}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <View style={[styles.dot, { backgroundColor: palette.red }]} />
        <View style={styles.text}>
          <Text style={[styles.title, { color: palette.paper }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.status, { color: palette.paper }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={leave}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Leave ${title}`}
        style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
      >
        <Text style={[styles.leaveText, { color: palette.paper }]}>Leave</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.gutter,
    minHeight: 54,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  status: { fontFamily: fontFamilies.sansRegular, fontSize: 12, opacity: 0.75, marginTop: 1 },
  leave: { paddingVertical: 8, paddingLeft: 14, minHeight: 44, justifyContent: "center" },
  leaveText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pressed: { opacity: 0.75 },
});
