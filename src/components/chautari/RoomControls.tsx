import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { HandButton } from "./HandButton";
import { REACTIONS, type ReactionId } from "@/features/chautari/reactions";
import { HandIcon, MicIcon, ReactIcon } from "./RoomIcons";

/**
 * The bar under a Chautari room: leave on the left, the reader's own voice on
 * the right. Speakers get the microphone, listeners get the hand; which one
 * appears is decided by the server's grant, never by the button. Everyone in
 * the room gets the reaction button, which opens a row of emoji above the bar.
 */

/** The emoji row closes itself after this long without a tap. */
const TRAY_IDLE_MS = 4000;

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
  onReact,
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
  /** React with an emoji (everyone in the room). */
  onReact?: (reaction: ReactionId) => void;
  connected: boolean;
  insetsBottom: number;
}) {
  const { palette } = useTheme();
  const [trayOpen, setTrayOpen] = useState(false);
  // Each tap restarts the countdown; leaving the room closes it.
  const [lastTap, setLastTap] = useState(0);
  useEffect(() => {
    if (!trayOpen) return undefined;
    const t = setTimeout(() => setTrayOpen(false), TRAY_IDLE_MS);
    return () => clearTimeout(t);
  }, [trayOpen, lastTap]);
  const showTray = trayOpen && connected && Boolean(onReact);

  return (
    <View>
      {showTray ? (
        <View
          style={[
            styles.tray,
            { backgroundColor: palette.paper, borderColor: palette.rule2 },
          ]}
          accessibilityRole="toolbar"
          accessibilityLabel="Reactions"
        >
          {REACTIONS.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => {
                setLastTap(Date.now());
                onReact?.(r.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`React: ${r.label}`}
              hitSlop={4}
              style={({ pressed }) => [
                styles.trayItem,
                pressed && styles.trayPressed,
              ]}
            >
              <Text style={styles.trayEmoji}>{r.emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
          accessibilityLabel={
            isHost ? "End this room for everyone" : "Leave this room"
          }
          style={({ pressed }) => [
            styles.leave,
            { borderColor: isHost ? palette.red : palette.rule2 },
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.leaveText,
              { color: isHost ? palette.red : palette.ink },
            ]}
          >
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
                <Text style={styles.countText}>
                  {handsCount > 99 ? "99+" : handsCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        {onReact ? (
          <Pressable
            onPress={() => {
              tick();
              setTrayOpen((open) => !open);
            }}
            disabled={!connected}
            accessibilityRole="button"
            accessibilityLabel={
              showTray ? "Close reactions" : "React with an emoji"
            }
            accessibilityState={{ disabled: !connected, expanded: showTray }}
            style={({ pressed }) => [
              styles.round,
              {
                borderColor: showTray ? palette.ink : palette.rule2,
                opacity: connected ? 1 : 0.4,
              },
              pressed && styles.pressed,
            ]}
          >
            <ReactIcon size={24} color={palette.ink} />
          </Pressable>
        ) : null}

        {canPublish ? (
          <Pressable
            onPress={() => {
              tick();
              onToggleMic();
            }}
            accessibilityRole="button"
            accessibilityLabel={
              micEnabled ? "Mute your microphone" : "Unmute your microphone"
            }
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
            <MicIcon
              size={24}
              color={micEnabled ? palette.paper : palette.ink}
              off={!micEnabled}
            />
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
    </View>
  );
}

const styles = StyleSheet.create({
  // Floats over the room rather than pushing it up.
  tray: {
    position: "absolute",
    bottom: "100%",
    right: spacing.gutter,
    zIndex: 10,
    flexDirection: "row",
    marginBottom: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 28,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  trayItem: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  trayPressed: { transform: [{ scale: 1.25 }] },
  trayEmoji: { fontSize: 28, lineHeight: 34 },
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
});
