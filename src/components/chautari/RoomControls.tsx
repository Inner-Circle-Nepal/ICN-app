import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { HandButton } from "./HandButton";
import { HandIcon, MicIcon } from "./RoomIcons";

/**
 * The bar under a Chautari room: leave on the left, the reader's own voice on
 * the right. Speakers get the microphone, listeners get the hand; which one
 * appears is decided by the server's grant, never by the button.
 */

function tick() {
  void Haptics.selectionAsync().catch(() => {});
}

export function RoomControls({
  isHost,
  canModerate,
  handsCount,
  onOpenHands,
  canPublish,
  micEnabled,
  onToggleMic,
  onEnd,
  onLeave,
  handRaised,
  handBusy,
  onToggleHand,
  onClap,
  clapBusy = false,
  onGift,
  connected,
  insetsBottom,
}: {
  isHost: boolean;
  /** Host or moderator: shows the raised-hands queue. */
  canModerate: boolean;
  handsCount: number;
  onOpenHands: () => void;
  canPublish: boolean;
  micEnabled: boolean;
  onToggleMic: () => void;
  onEnd: () => void;
  onLeave: () => void;
  handRaised: boolean;
  handBusy: boolean;
  onToggleHand: () => void;
  /** Host or moderator: applause everyone in the room hears. */
  onClap?: () => void;
  clapBusy?: boolean;
  /** Anyone but the host, when gifts are on: opens the gift sheet. */
  onGift?: () => void;
  connected: boolean;
  insetsBottom: number;
}) {
  const { palette } = useTheme();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: palette.paper,
          borderTopColor: palette.rule,
          paddingBottom: Math.max(12, insetsBottom),
        },
      ]}
    >
      <Pressable
        onPress={isHost ? onEnd : onLeave}
        accessibilityRole="button"
        accessibilityLabel={isHost ? "End this room for everyone" : "Leave this room"}
        style={({ pressed }) => [
          styles.leave,
          { borderColor: isHost ? palette.red : palette.rule2 },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.leaveText, { color: isHost ? palette.red : palette.ink }]}>
          {isHost ? "End room" : "Leave quietly"}
        </Text>
      </Pressable>

      <View style={styles.spacer} />

      {canModerate ? (
        <Pressable
          onPress={() => {
            tick();
            onOpenHands();
          }}
          accessibilityRole="button"
          accessibilityLabel={
            handsCount === 0
              ? "Raised hands, none waiting"
              : `Raised hands, ${handsCount} waiting`
          }
          style={({ pressed }) => [
            styles.round,
            { borderColor: palette.rule2 },
            pressed && styles.pressed,
          ]}
        >
          <HandIcon size={24} color={palette.ink} />
          {handsCount > 0 ? (
            <View style={[styles.count, { backgroundColor: palette.red }]}>
              <Text style={styles.countText}>{handsCount > 99 ? "99+" : handsCount}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {canModerate && onClap ? (
        <Pressable
          onPress={() => {
            tick();
            onClap();
          }}
          disabled={clapBusy || !connected}
          accessibilityRole="button"
          accessibilityLabel="Applause: play a clapping sound for everyone in the room"
          accessibilityState={{ disabled: clapBusy || !connected, busy: clapBusy }}
          style={({ pressed }) => [
            styles.round,
            { borderColor: palette.rule2, opacity: connected ? 1 : 0.4 },
            pressed && styles.pressed,
          ]}
        >
          {clapBusy ? (
            <ActivityIndicator size="small" color={palette.ink} />
          ) : (
            <Text style={styles.clap} accessible={false}>
              👏
            </Text>
          )}
        </Pressable>
      ) : null}

      {onGift ? (
        <Pressable
          onPress={() => {
            tick();
            onGift();
          }}
          disabled={!connected}
          accessibilityRole="button"
          accessibilityLabel="Send the host a gift"
          accessibilityState={{ disabled: !connected }}
          style={({ pressed }) => [
            styles.round,
            { borderColor: palette.rule2, opacity: connected ? 1 : 0.4 },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.clap} accessible={false}>
            🎁
          </Text>
        </Pressable>
      ) : null}

      {canPublish ? (
        <Pressable
          onPress={() => {
            tick();
            onToggleMic();
          }}
          accessibilityRole="button"
          accessibilityLabel={micEnabled ? "Mute your microphone" : "Unmute your microphone"}
          accessibilityState={{ selected: micEnabled }}
          style={({ pressed }) => [
            styles.round,
            {
              borderColor: palette.ink,
              backgroundColor: micEnabled ? palette.ink : "transparent",
            },
            pressed && styles.pressed,
          ]}
        >
          <MicIcon size={24} color={micEnabled ? palette.paper : palette.ink} off={!micEnabled} />
        </Pressable>
      ) : (
        <HandButton
          raised={handRaised}
          busy={handBusy}
          disabled={handBusy || !connected}
          onPress={() => {
            tick();
            onToggleHand();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 12,
  },
  leave: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 22,
    justifyContent: "center",
  },
  leaveText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  spacer: { flex: 1 },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    color: "#ffffff",
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
  },
  pressed: { opacity: 0.7 },
  clap: { fontSize: 22, lineHeight: 28 },
});
