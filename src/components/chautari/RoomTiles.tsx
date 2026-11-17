import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RoomMember } from "@/features/chautari/useChautariRoom";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { Avatar } from "./Avatar";
import { HandIcon, MicIcon } from "./RoomIcons";

/**
 * The people in a Chautari room.
 *
 * A tile shows who someone is and what state they are in, and nothing else:
 * the red ring is live speech, the badge on the avatar is a muted microphone
 * or a raised hand. Everything that can be done to a person lives behind a
 * tap, so the grid stays a grid of faces.
 */

type TileProps = {
  member: RoomMember;
  /** The reader has blocked this person and is not hearing them. */
  blocked: boolean;
  /** The reader's own picture, for their own tile before the room carries it. */
  localImageUrl: string | null;
  onPress: (member: RoomMember) => void;
};

function Badge({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View
      style={[styles.badge, { backgroundColor: palette.paper, borderColor: palette.rule2 }]}
    >
      {children}
    </View>
  );
}

function firstName(full: string): string {
  const i = full.indexOf(" ");
  return i === -1 ? full : full.slice(0, i);
}

export const SpeakerTile = React.memo(function SpeakerTile({
  member: p,
  blocked,
  localImageUrl,
  onPress,
}: TileProps) {
  const { palette } = useTheme();
  const speaking = p.isSpeaking && !p.isMuted && !blocked;
  const state = blocked ? "Blocked" : speaking ? "Speaking" : p.isMuted ? "Muted" : "On stage";

  return (
    <Pressable
      onPress={() => onPress(p)}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}${p.isLocal ? ", you" : ""}${p.isHost ? ", host" : p.isModerator ? ", moderator" : ""}. ${state}.`}
      style={({ pressed }) => [styles.speakerTile, pressed && styles.pressed]}
    >
      <View>
        <Avatar
          name={p.name}
          size="xl"
          speaking={speaking}
          imageUrl={p.avatarUrl ?? (p.isLocal ? localImageUrl : null)}
        />
        {p.isMuted && !blocked ? (
          <Badge>
            <MicIcon size={13} color={palette.ink2} off />
          </Badge>
        ) : null}
      </View>
      <Text style={[styles.speakerName, { color: palette.ink }]} numberOfLines={1}>
        {p.isLocal ? "You" : p.name}
      </Text>
      {p.isHost || p.isModerator || blocked ? (
        <Text
          style={[
            styles.tag,
            { color: blocked ? palette.quiet : p.isHost ? palette.red : palette.ink2 },
          ]}
          numberOfLines={1}
        >
          {blocked ? "Blocked" : p.isHost ? "Host" : "Moderator"}
        </Text>
      ) : null}
    </Pressable>
  );
});

export const ListenerTile = React.memo(function ListenerTile({
  member: p,
  blocked,
  localImageUrl,
  onPress,
}: TileProps) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={() => onPress(p)}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}${p.isLocal ? ", you" : ""}. Listening.${p.handRaised ? " Hand raised." : ""}${blocked ? " Blocked." : ""}`}
      style={({ pressed }) => [styles.listenerTile, pressed && styles.pressed]}
    >
      <View>
        <Avatar
          name={p.name}
          size="md"
          imageUrl={p.avatarUrl ?? (p.isLocal ? localImageUrl : null)}
        />
        {p.handRaised ? (
          <Badge>
            <HandIcon size={13} color={palette.ink} />
          </Badge>
        ) : null}
      </View>
      <Text style={[styles.listenerName, { color: palette.ink2 }]} numberOfLines={1}>
        {p.isLocal ? "You" : firstName(p.name)}
      </Text>
      {blocked ? (
        <Text style={[styles.tag, { color: palette.quiet }]}>Blocked</Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  speakerTile: { width: "33.33%", alignItems: "center", paddingVertical: 10 },
  speakerName: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  // A fixed quarter, so a short last row stays left-aligned in the grid.
  listenerTile: { width: "25%", alignItems: "center", paddingVertical: 8 },
  listenerName: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    marginTop: 5,
    textAlign: "center",
  },
  tag: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginTop: 2,
  },
  badge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
});
