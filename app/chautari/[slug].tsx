import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import Svg, { Path, Rect } from "react-native-svg";

import {
  ChautariError,
  endRoom,
  moderate,
  setHandRaised,
  type ModerationAction,
} from "@/lib/api/chautari";
import {
  isBusy,
  useChautariRoom,
  type RoomMember,
} from "@/features/chautari/useChautariRoom";
import { isClerkConfigured } from "@/constants/config";
import { isLiveKitAvailable } from "@/lib/livekit/platform";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { ErrorState } from "@/components/ErrorState";

/**
 * Inside a Chautari room.
 *
 * The screen never decides what the reader may do: `role` and `canPublish`
 * come back from the server with the join token, and the microphone button
 * only exists when the token says so. A host revoking a speaker mid-room
 * arrives as a permissions event and the button disappears.
 */
export default function ChautariRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const raw = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const slug = raw ? decodeURIComponent(raw) : "";

  const { palette } = useTheme();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const displayName =
    user?.fullName?.trim() || user?.firstName?.trim() || null;

  const room = useChautariRoom(slug, getToken, displayName);

  const [handRaised, setHandRaisedState] = useState(false);
  const [handBusy, setHandBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isHost = room.role === "host";

  /*
   * Live audio needs the WebRTC native module, which Expo Go does not carry.
   * Checked once rather than per render: the answer cannot change while the
   * process lives.
   */
  const [liveAudioSupported] = useState(isLiveKitAvailable);

  /* Connect once, as soon as we have a signed-in reader and a slug. */
  useEffect(() => {
    if (!liveAudioSupported) return;
    if (isSignedIn && slug && room.phase === "idle") room.connect();
  }, [liveAudioSupported, isSignedIn, slug, room]);

  const leaveAndBack = useCallback(() => {
    room.leave();
    if (router.canGoBack()) router.back();
    else router.replace("/chautari");
  }, [room, router]);

  const toggleHand = useCallback(async () => {
    if (handBusy) return;
    setHandBusy(true);
    const next = !handRaised;
    try {
      await setHandRaised(getToken, { roomSlug: slug, raised: next, displayName });
      setHandRaisedState(next);
      setNotice(next ? "Your hand is raised. The host will see it." : null);
    } catch (e) {
      setNotice(e instanceof ChautariError ? e.message : "Could not do that.");
    } finally {
      setHandBusy(false);
    }
  }, [handBusy, handRaised, getToken, slug, displayName]);

  const act = useCallback(
    async (targetUserId: string, action: ModerationAction) => {
      try {
        const res = await moderate(getToken, { roomSlug: slug, targetUserId, action });
        setNotice(
          res.applied
            ? null
            : "Saved, but the change may take a moment to reach the room.",
        );
      } catch (e) {
        setNotice(e instanceof ChautariError ? e.message : "Could not do that.");
      }
    },
    [getToken, slug],
  );

  const confirmEnd = useCallback(() => {
    Alert.alert(
      "End this room?",
      "Everyone will be disconnected. This cannot be undone.",
      [
        { text: "Keep talking", style: "cancel" },
        {
          text: "End room",
          style: "destructive",
          onPress: () => {
            void endRoom(getToken, slug)
              .then(leaveAndBack)
              .catch((e: unknown) =>
                setNotice(e instanceof ChautariError ? e.message : "Could not end the room."),
              );
          },
        },
      ],
    );
  }, [getToken, slug, leaveAndBack]);

  /* ----------------------------------------------------------- gates */

  if (!isClerkConfigured) {
    return (
      <Shell onBack={leaveAndBack}>
        <ErrorState
          title="Conversations are unavailable"
          message="This build has no account system configured."
        />
      </Shell>
    );
  }

  /*
   * Stated before the sign-in gate: there is no point sending someone to
   * create an account for a room this build cannot join either way.
   */
  if (!liveAudioSupported) {
    return (
      <Shell onBack={leaveAndBack}>
        <ErrorState
          title="Live audio needs the full app"
          message="This preview build cannot play live conversations. Install Inner Circle Nepal from the app store to listen."
        />
      </Shell>
    );
  }

  if (!isSignedIn) {
    return (
      <Shell onBack={leaveAndBack}>
        <ErrorState
          title="Sign in to join"
          message="Chautari rooms are open to readers with an account. Listening is free."
          onRetry={() => router.push("/sign-in")}
        />
      </Shell>
    );
  }

  if (room.phase === "error") {
    return (
      <Shell onBack={leaveAndBack}>
        <ErrorState
          title="Could not join"
          message={room.error ?? "Please try again."}
          onRetry={room.retry}
        />
      </Shell>
    );
  }

  if (room.phase === "ended") {
    return (
      <Shell onBack={leaveAndBack}>
        <ErrorState
          title="This conversation has ended"
          message="The host closed the room, or the connection was lost for too long."
          onRetry={() => router.replace("/chautari")}
        />
      </Shell>
    );
  }

  const speakers = room.members.filter((m) => m.canPublish);
  const listeners = room.members.filter((m) => !m.canPublish);

  return (
    <Shell onBack={leaveAndBack}>
      <ScrollView contentContainerStyle={styles.body}>
        {/* Connection state, stated plainly rather than hidden behind a spinner */}
        <View style={styles.statusRow}>
          {room.phase === "connected" ? (
            <>
              <View style={[styles.liveDot, { backgroundColor: palette.red }]} />
              <Text style={[styles.status, { color: palette.red }]}>Live</Text>
            </>
          ) : (
            <>
              <ActivityIndicator size="small" color={palette.quiet} />
              <Text style={[styles.status, { color: palette.quiet }]}>
                {room.phase === "reconnecting"
                  ? "Reconnecting…"
                  : room.phase === "requesting"
                    ? "Checking your access…"
                    : "Connecting…"}
              </Text>
            </>
          )}
          {room.role ? (
            <Text style={[styles.roleTag, { color: palette.quiet }]}>
              · You are a {room.role}
            </Text>
          ) : null}
        </View>

        {notice ? (
          <View style={[styles.notice, { borderLeftColor: palette.rule2 }]}>
            <Text style={[styles.noticeText, { color: palette.quiet }]}>{notice}</Text>
          </View>
        ) : null}

        <PeopleGroup
          label={`Speaking · ${speakers.length}`}
          people={speakers}
          isHost={isHost}
          onAct={act}
        />
        <PeopleGroup
          label={`Listening · ${listeners.length}`}
          people={listeners}
          isHost={isHost}
          onAct={act}
          quiet
        />

        {isBusy(room.phase) ? null : (
          <Text style={[styles.hint, { color: palette.quiet }]}>
            {room.canPublish
              ? "Your microphone is yours to control. Mute when you are not speaking."
              : "You are listening. Raise a hand if you would like to speak."}
          </Text>
        )}
      </ScrollView>

      {/* ------------------------------------------------------ controls */}
      <View style={[styles.controls, { borderTopColor: palette.rule, backgroundColor: palette.paper }]}>
        {room.canPublish ? (
          <Pressable
            onPress={room.toggleMic}
            accessibilityRole="button"
            accessibilityLabel={room.micEnabled ? "Mute your microphone" : "Unmute your microphone"}
            accessibilityState={{ selected: room.micEnabled }}
            style={({ pressed }) => [
              styles.micBtn,
              {
                borderColor: palette.ink,
                backgroundColor: room.micEnabled ? palette.ink : "transparent",
              },
              pressed && styles.pressed,
            ]}
          >
            <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
              <Rect
                x={9}
                y={3}
                width={6}
                height={11}
                rx={3}
                stroke={room.micEnabled ? palette.paper : palette.ink}
                strokeWidth={1.7}
              />
              <Path
                d="M5 11a7 7 0 0 0 14 0M12 18v3"
                stroke={room.micEnabled ? palette.paper : palette.ink}
                strokeWidth={1.7}
                strokeLinecap="round"
              />
              {!room.micEnabled ? (
                <Path d="M4 4l16 16" stroke={palette.ink} strokeWidth={1.7} strokeLinecap="round" />
              ) : null}
            </Svg>
            <Text
              style={[
                styles.micText,
                { color: room.micEnabled ? palette.paper : palette.ink },
              ]}
            >
              {room.micEnabled ? "Live" : "Muted"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void toggleHand()}
            disabled={handBusy || room.phase !== "connected"}
            accessibilityRole="button"
            accessibilityLabel={handRaised ? "Lower your hand" : "Raise your hand to speak"}
            accessibilityState={{ selected: handRaised, disabled: handBusy }}
            style={({ pressed }) => [
              styles.micBtn,
              {
                borderColor: palette.rule2,
                backgroundColor: handRaised ? palette.paper2 : "transparent",
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.micText, { color: palette.ink }]}>
              {handBusy ? "…" : handRaised ? "Hand raised" : "Raise hand"}
            </Text>
          </Pressable>
        )}

        <View style={styles.controlSpacer} />

        {isHost ? (
          <Pressable
            onPress={confirmEnd}
            accessibilityRole="button"
            accessibilityLabel="End this room for everyone"
            style={({ pressed }) => [styles.leaveBtn, pressed && styles.pressed]}
          >
            <Text style={[styles.leaveText, { color: palette.red }]}>End room</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={leaveAndBack}
            accessibilityRole="button"
            accessibilityLabel="Leave this room"
            style={({ pressed }) => [styles.leaveBtn, pressed && styles.pressed]}
          >
            <Text style={[styles.leaveText, { color: palette.quiet }]}>Leave</Text>
          </Pressable>
        )}
      </View>
    </Shell>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <View style={[styles.topBar, { borderBottomColor: palette.rule }]}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Leave and go back"
          style={styles.backBtn}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M19 12H5M11 6l-6 6 6 6"
              stroke={palette.ink}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={[styles.backLabel, { color: palette.ink }]}>Leave</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: palette.quiet }]}>Chautari</Text>
      </View>
      {children}
    </View>
  );
}

function PeopleGroup({
  label,
  people,
  isHost,
  onAct,
  quiet = false,
}: {
  label: string;
  people: RoomMember[];
  isHost: boolean;
  onAct: (id: string, action: ModerationAction) => Promise<void>;
  quiet?: boolean;
}) {
  const { palette } = useTheme();
  if (people.length === 0) return null;

  return (
    <View style={styles.group}>
      <Text style={[styles.groupLabel, { color: palette.ink }]}>{label}</Text>
      {people.map((p) => (
        <View key={p.identity} style={[styles.person, { borderBottomColor: palette.rule }]}>
          <View
            style={[
              styles.speakingRing,
              {
                borderColor: p.isSpeaking && !p.isMuted ? palette.red : "transparent",
                backgroundColor: palette.paper2,
              },
            ]}
          >
            <Text style={[styles.initial, { color: palette.ink }]}>
              {p.name.slice(0, 1).toUpperCase()}
            </Text>
          </View>

          <View style={styles.personText}>
            <Text style={[styles.personName, { color: palette.ink }]} numberOfLines={1}>
              {p.name}
              {p.isLocal ? " (you)" : ""}
            </Text>
            <Text style={[styles.personMeta, { color: quiet ? palette.quiet : palette.quiet }]}>
              {p.canPublish ? (p.isMuted ? "Muted" : "Speaking") : "Listening"}
            </Text>
          </View>

          {/* Host controls never appear against the host's own row. */}
          {isHost && !p.isLocal ? (
            <View style={styles.actions}>
              {p.canPublish ? (
                <>
                  <HostAction label="Mute" onPress={() => void onAct(p.identity, "mute")} />
                  <HostAction
                    label="Demote"
                    onPress={() => void onAct(p.identity, "demote_speaker")}
                  />
                </>
              ) : (
                <HostAction
                  label="Invite"
                  onPress={() => void onAct(p.identity, "approve_speaker")}
                />
              )}
              <HostAction
                label="Remove"
                danger
                onPress={() => void onAct(p.identity, "remove")}
              />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function HostAction({
  label,
  onPress,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Text style={[styles.actionText, { color: danger ? palette.red : palette.quiet }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    height: 48,
    paddingHorizontal: spacing.gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36 },
  backLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  topTitle: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  body: { paddingHorizontal: spacing.gutter, paddingTop: 18, paddingBottom: 30 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  status: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  roleTag: { fontFamily: fontFamilies.sansRegular, fontSize: 11.5 },
  notice: { borderLeftWidth: 2, paddingLeft: 10, marginTop: 14 },
  noticeText: { fontFamily: fontFamilies.sansRegular, fontSize: 12.5, lineHeight: 18 },
  group: { marginTop: 26 },
  groupLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  speakingRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontFamily: fontFamilies.serifMedium, fontSize: 16 },
  personText: { flex: 1, minWidth: 0 },
  personName: { fontFamily: fontFamilies.serifMedium, fontSize: 16 },
  personMeta: { fontFamily: fontFamilies.sansRegular, fontSize: 11.5, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  action: { minHeight: 30, justifyContent: "center" },
  actionText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  hint: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 26,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.gutter,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  controlSpacer: { flex: 1 },
  micBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  micText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  leaveBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  leaveText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  pressed: { opacity: 0.75 },
});
