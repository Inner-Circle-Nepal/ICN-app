import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import type { RoomMember } from "@/features/chautari/useChautariRoom";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { Avatar } from "./Avatar";
import { BottomSheet } from "./BottomSheet";

/**
 * Everyone asking to speak, for the host and moderators to answer.
 *
 * The list is the room's own raised-hand attributes, so it fills and empties
 * live: a hand lowered, or answered by another moderator, drops out here too.
 */
export function HandsSheet({
  visible,
  hands,
  onClose,
  onAccept,
  onDecline,
}: {
  visible: boolean;
  hands: RoomMember[];
  onClose: () => void;
  onAccept: (member: RoomMember) => void;
  onDecline: (member: RoomMember) => void;
}) {
  const { palette } = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.kicker, { color: palette.quiet }]}>Hands raised · {hands.length}</Text>
      <Text style={[styles.title, { color: palette.ink }]}>Who wants to speak</Text>

      {hands.length === 0 ? (
        <Text style={[styles.empty, { color: palette.quiet }]}>
          No hands up right now. Raised hands appear here as they come in.
        </Text>
      ) : (
        <FlatList
          data={hands}
          keyExtractor={(m) => m.identity}
          style={[styles.list, { borderTopColor: palette.rule }]}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderBottomColor: palette.rule }]}>
              <Avatar name={item.name} size="sm" imageUrl={item.avatarUrl} />
              <View style={styles.who}>
                <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.username ? (
                  <Text style={[styles.handle, { color: palette.quiet }]} numberOfLines={1}>
                    @{item.username}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => onDecline(item)}
                accessibilityRole="button"
                accessibilityLabel={`Decline ${item.name}`}
                style={({ pressed }) => [
                  styles.btn,
                  { borderColor: palette.rule2 },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.btnText, { color: palette.quiet }]}>Decline</Text>
              </Pressable>
              <Pressable
                onPress={() => onAccept(item)}
                accessibilityRole="button"
                accessibilityLabel={`Invite ${item.name} to the stage`}
                style={({ pressed }) => [
                  styles.btn,
                  { borderColor: palette.ink, backgroundColor: palette.ink },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.btnText, { color: palette.paper }]}>Accept</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: { fontFamily: fontFamilies.serifLight, fontSize: 24, lineHeight: 29, marginTop: 6 },
  empty: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
    marginBottom: 8,
  },
  list: { borderTopWidth: 1, marginTop: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  who: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  handle: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 1 },
  btn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    justifyContent: "center",
  },
  btnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pressed: { opacity: 0.75 },
});
