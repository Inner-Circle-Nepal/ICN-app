import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  END_MESSAGES,
  isBusy,
  useChautariRoom,
  type RoomMember,
} from "@/features/chautari/useChautariRoom";
import { isClerkConfigured } from "@/constants/config";
import { isLiveKitAvailable } from "@/lib/livekit/platform";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { Avatar } from "@/components/chautari/Avatar";
import { ErrorState } from "@/components/ErrorState";

/**
 * Inside a Chautari room.
 *
 * The screen never decides what the reader may do: `role` and `canPublish`
 * come back from the server with the join token, and the microphone button
 * only exists when the token says so. A host revoking a speaker mid-room
 * arrives as a permissions event and the button disappears.
 *
 * The room's NAME is a separate matter from its permissions. The title shown
 * in the header comes from the server's grant once connected; before that it
 * falls back to a title passed through navigation, which is cosmetic only and
 * is never consulted for authorisation.
 */

/**
 * Only listeners are virtualised.
 *
 * Speakers belong on a stage at the top where they can be seen at a glance,
 * and there are never many of them — a room has one host and whoever has
 * been invited up. Listeners are the unbounded side (the default ceiling is
 * 200 and the maximum is 1,000), so they are what `FlatList` windows.
 */
interface ListenerRow {
  key: string;
  member: RoomMember;
}

export default function ChautariRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    slug?: string | string[];
    title?: string;
    host?: string;
  }>();
  const raw = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const slug = raw ? decodeURIComponent(raw) : "";
  /*
   * Both COSMETIC, carried from the schedule so the header is not blank
   * while the token request is in flight. The title is replaced by the
   * server's own as soon as the grant lands; the host name has no
   * server-side equivalent on this endpoint and is simply absent on a cold
   * deep link. Neither is read by anything that decides what the reader may
   * do — that is `room.role` and `room.canPublish`, both from the grant.
   */
  const hintedTitle = typeof params.title === "string" ? params.title : null;
  const hintedHost = typeof params.host === "string" && params.host ? params.host : null;

  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const displayName = user?.fullName?.trim() || user?.firstName?.trim() || null;

  /*
   * The reader's own photograph, as a fallback.
   *
   * Everyone's picture now arrives through LiveKit participant metadata, put
   * there by the token endpoint and relayed to the whole room — see
   * `avatarFromMetadata` in useChautariRoom. This covers the two moments that
   * does not: a build talking to a backend that predates the field, and the
   * reader changing their picture mid-room, where their own already-minted
   * token still carries the old one.
   *
   * `hasImage` separates a real upload from the placeholder Clerk generates
   * for every account. Passed down rather than read inside each tile, so the
   * memoised rows keep their identity.
   */
  const localImageUrl = user?.hasImage ? user.imageUrl : null;

  const room = useChautariRoom(slug, getToken, displayName);

  const [handRaised, setHandRaisedState] = useState(false);
  const [handBusy, setHandBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isHost = room.role === "host";
  const title = room.identity?.title ?? hintedTitle ?? "Chautari";

  /*
   * Clerk's getToken is not guaranteed stable across renders; keeping it in a
   * ref keeps the callbacks below stable. Synced in an effect rather than in
   * the render body — every reader of it runs from a press handler, which is
   * always after the effect has run.
   */
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  /*
   * Live audio needs the WebRTC native module, which Expo Go does not carry.
   * Checked once rather than per render: the answer cannot change while the
   * process lives.
   */
  const [liveAudioSupported] = useState(isLiveKitAvailable);

  /*
   * Connect once, on arrival.
   *
   * Depends on PRIMITIVES and on `connect`, which the hook now keeps stable.
   * The old version depended on the whole room object — a new object every
   * render — so it ran constantly, and because `leave()` returned the phase
   * to "idle" it would immediately reconnect a room the user had just left.
   * `leave()` now lands on "left", which this condition deliberately excludes.
   */
  const { phase, connect } = room;
  useEffect(() => {
    if (!liveAudioSupported || !isSignedIn || !slug) return;
    if (phase === "idle") connect();
  }, [liveAudioSupported, isSignedIn, slug, phase, connect]);

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
      await setHandRaised(getTokenRef.current, { roomSlug: slug, raised: next, displayName });
      setHandRaisedState(next);
      setNotice(next ? "Your hand is raised. The host will see it." : null);
    } catch (e) {
      setNotice(e instanceof ChautariError ? e.message : "Could not do that.");
    } finally {
      setHandBusy(false);
    }
  }, [handBusy, handRaised, slug, displayName]);

  const act = useCallback(
    async (targetUserId: string, action: ModerationAction) => {
      try {
        const res = await moderate(getTokenRef.current, { roomSlug: slug, targetUserId, action });
        setNotice(
          res.applied ? null : "Saved, but the change may take a moment to reach the room.",
        );
      } catch (e) {
        setNotice(e instanceof ChautariError ? e.message : "Could not do that.");
      }
    },
    [slug],
  );

  /**
   * Removing somebody is irreversible from their side — `removed_at` is set
   * and the token endpoint refuses to mint for them again. "End room" already
   * asked before doing something consequential; this is no less consequential
   * for the person on the receiving end.
   */
  const confirmAct = useCallback(
    (member: RoomMember, action: ModerationAction) => {
      if (action !== "remove") {
        void act(member.identity, action);
        return;
      }
      Alert.alert(
        `Remove ${member.name}?`,
        "They will be disconnected and cannot rejoin this room.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => void act(member.identity, "remove"),
          },
        ],
      );
    },
    [act],
  );

  const confirmEnd = useCallback(() => {
    Alert.alert("End this room?", "Everyone will be disconnected. This cannot be undone.", [
      { text: "Keep talking", style: "cancel" },
      {
        text: "End room",
        style: "destructive",
        onPress: () => {
          void endRoom(getTokenRef.current, slug)
            .then(leaveAndBack)
            .catch((e: unknown) =>
              setNotice(e instanceof ChautariError ? e.message : "Could not end the room."),
            );
        },
      },
    ]);
  }, [slug, leaveAndBack]);

  /* Split once per member change. `canPublish` is the server's word, not ours. */
  const speakers = useMemo(
    () => room.members.filter((m) => m.canPublish),
    [room.members],
  );
  const listenerRows = useMemo<ListenerRow[]>(
    () =>
      room.members
        .filter((m) => !m.canPublish)
        .map((m) => ({ key: m.identity, member: m })),
    [room.members],
  );

  /* ----------------------------------------------------------- gates */

  if (!isClerkConfigured) {
    return (
      <Shell title={title} onBack={leaveAndBack}>
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
      <Shell title={title} onBack={leaveAndBack}>
        <ErrorState
          title="Live audio needs the full app"
          message="This preview build cannot play live conversations. Install Inner Circle Nepal from the app store to listen."
        />
      </Shell>
    );
  }

  if (!isSignedIn) {
    return (
      <Shell title={title} onBack={leaveAndBack}>
        <ErrorState
          title="Sign in to join"
          message="Chautari rooms are open to readers with an account. Listening is free."
          onRetry={() => router.push("/sign-in")}
        />
      </Shell>
    );
  }

  /* The user asked to leave; navigation is already under way. */
  if (room.phase === "left") {
    return <Shell title={title} onBack={leaveAndBack} />;
  }

  if (room.phase === "error") {
    return (
      <Shell title={title} onBack={leaveAndBack}>
        <ErrorState
          title="Could not join"
          message={room.error ?? "Please try again."}
          onRetry={room.retry}
        />
      </Shell>
    );
  }

  if (room.phase === "ended") {
    const copy = END_MESSAGES[room.endReason ?? "unknown"];
    return (
      <Shell title={title} onBack={leaveAndBack}>
        <ErrorState
          title={copy.title}
          message={copy.message}
          /*
           * Reconnecting is worth offering when the room is still running and
           * the reader could plausibly get back in — a dropped signal, or the
           * same account having taken the room on another device. Being
           * removed, or the host closing up, are not retryable; those send
           * the reader back to the schedule instead.
           */
          onRetry={
            room.endReason === "connection_lost" || room.endReason === "joined_elsewhere"
              ? room.retry
              : () => router.replace("/chautari")
          }
        />
      </Shell>
    );
  }

  return (
    <Shell title={title} onBack={leaveAndBack}>
      <FlatList
        data={listenerRows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.body}
        /*
         * A room's ceiling is 1,000 participants and its default is 200. The
         * previous ScrollView mounted every one of them.
         */
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
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
              {room.phase === "connected" && room.members.length > 0 ? (
                /*
                 * "in the room", not "listeners" — this counts the
                 * participants THIS client has been told about, which on a
                 * large room is not the figure the server would quote.
                 */
                <Text style={[styles.roleTag, { color: palette.quiet }]}>
                  · {room.members.length} in the room
                </Text>
              ) : null}
            </View>

            {/*
              Who is hosting, and what you are.
              `hintedHost` is carried from the schedule and is cosmetic — the
              server never tells the client who hosts a room it is not
              hosting, so this is absent on a cold deep link. `room.role` IS
              authoritative: it comes back with the grant.
            */}
            {hintedHost || room.role ? (
              <View style={styles.identityRow}>
                {hintedHost ? (
                  <>
                    <Avatar name={hintedHost} size="sm" />
                    <Text style={[styles.hostLine, { color: palette.ink2 }]} numberOfLines={1}>
                      Hosted by {hintedHost}
                    </Text>
                  </>
                ) : null}
                {room.role ? (
                  <View style={[styles.rolePill, { borderColor: palette.rule2 }]}>
                    <Text style={[styles.rolePillText, { color: palette.quiet }]}>
                      You · {room.role}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {room.micError ? (
              <View style={[styles.notice, { borderLeftColor: palette.red }]}>
                <Text style={[styles.noticeText, { color: palette.ink }]} accessibilityRole="alert">
                  {room.micError}
                </Text>
                <View style={styles.noticeActions}>
                  {room.micBlocked ? (
                    <Pressable
                      onPress={() => void Linking.openSettings()}
                      accessibilityRole="button"
                      accessibilityLabel="Open app settings to allow the microphone"
                      style={({ pressed }) => [styles.noticeBtn, pressed && styles.pressed]}
                    >
                      <Text style={[styles.noticeBtnText, { color: palette.ink }]}>
                        Open settings
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={room.dismissMicError}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss this message"
                    style={({ pressed }) => [styles.noticeBtn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.noticeBtnText, { color: palette.quiet }]}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {notice ? (
              <View style={[styles.notice, { borderLeftColor: palette.rule2 }]}>
                <Text style={[styles.noticeText, { color: palette.quiet }]}>{notice}</Text>
                <View style={styles.noticeActions}>
                  <Pressable
                    onPress={() => setNotice(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss this message"
                    style={({ pressed }) => [styles.noticeBtn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.noticeBtnText, { color: palette.quiet }]}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* ------------------------------------------------- the stage */}
            {speakers.length > 0 ? (
              <>
                <Text style={[styles.groupLabel, { color: palette.ink }]}>
                  On stage · {speakers.length}
                </Text>
                <View style={styles.stage}>
                  {speakers.map((m) => (
                    <SpeakerTile
                      key={m.identity}
                      member={m}
                      isHost={isHost}
                      onAct={confirmAct}
                      localImageUrl={localImageUrl}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {listenerRows.length > 0 ? (
              <Text style={[styles.groupLabel, { color: palette.ink }]}>
                Listening · {listenerRows.length}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <PersonRowView
            member={item.member}
            isHost={isHost}
            onAct={confirmAct}
            localImageUrl={localImageUrl}
          />
        )}
        ListFooterComponent={
          isBusy(room.phase) ? undefined : (
            <Text style={[styles.hint, { color: palette.quiet }]}>
              {room.canPublish
                ? "Your microphone is yours to control. Mute when you are not speaking."
                : "You are listening. Raise a hand if you would like to speak."}
            </Text>
          )
        }
      />

      {/* ------------------------------------------------------ controls */}
      <View
        style={[
          styles.controls,
          {
            borderTopColor: palette.rule,
            backgroundColor: palette.paper,
            /*
             * The root layout takes only the TOP edge, and BottomNav hides on
             * this route — so nothing else is holding this bar clear of the
             * gesture bar or home indicator. Floored at the existing padding
             * so a device with no inset is unchanged.
             */
            paddingBottom: Math.max(12, insets.bottom),
          },
        ]}
      >
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
              style={[styles.micText, { color: room.micEnabled ? palette.paper : palette.ink }]}
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
            accessibilityState={{
              selected: handRaised,
              disabled: handBusy || room.phase !== "connected",
            }}
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

/**
 * The frame, and the one place the room is named.
 *
 * The title used to be absent entirely: the bar read "Chautari" and nothing
 * else, so a reader following a deep link had no way to tell what they had
 * joined.
 */
function Shell({
  children,
  onBack,
  title,
}: {
  children?: React.ReactNode;
  onBack: () => void;
  title: string;
}) {
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
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text
            style={[styles.topTitle, { color: palette.ink }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}

/** What a participant is doing, in words — never conveyed by colour alone. */
function stateLabel(p: RoomMember, speaking: boolean): string {
  if (!p.canPublish) return "Listening";
  if (speaking) return "Speaking";
  return p.isMuted ? "Muted" : "On stage";
}

/**
 * Someone on the stage.
 *
 * A tile rather than a row, so the few people actually talking read as a
 * group at the top of the screen instead of as the first entries in a long
 * list. Wraps at the container's width, so one speaker, four, or a dozen all
 * sit sensibly.
 */
const SpeakerTile = React.memo(function SpeakerTile({
  member: p,
  isHost,
  onAct,
  localImageUrl,
}: {
  member: RoomMember;
  isHost: boolean;
  onAct: (member: RoomMember, action: ModerationAction) => void;
  /** The reader's own picture, or null. Ignored for every other member. */
  localImageUrl: string | null;
}) {
  const { palette } = useTheme();
  /* Drawn only from LiveKit's own audio activity. Never decorative. */
  const speaking = p.isSpeaking && !p.isMuted;
  const label = stateLabel(p, speaking);

  return (
    <View
      style={styles.tile}
      accessible
      accessibilityLabel={`${p.name}${p.isLocal ? ", you" : ""}. ${label}.`}
    >
      <Avatar
        name={p.name}
        size="md"
        speaking={speaking}
        imageUrl={p.avatarUrl ?? (p.isLocal ? localImageUrl : null)}
      />
      <Text style={[styles.tileName, { color: palette.ink }]} numberOfLines={1}>
        {p.isLocal ? "You" : p.name}
      </Text>
      <Text style={[styles.tileMeta, { color: speaking ? palette.red : palette.quiet }]}>
        {label}
      </Text>

      {/* Host controls never appear against the host's own tile. */}
      {isHost && !p.isLocal ? (
        <View style={styles.tileActions}>
          <HostAction label="Mute" onPress={() => onAct(p, "mute")} />
          <HostAction label="Demote" onPress={() => onAct(p, "demote_speaker")} />
          <HostAction label="Remove" danger onPress={() => onAct(p, "remove")} />
        </View>
      ) : null}
    </View>
  );
});

/**
 * One listener.
 *
 * Memoised, and the hook preserves a member's object identity when nothing
 * about them changed — so a speaker change re-renders the people it concerns
 * rather than the whole room.
 */
const PersonRowView = React.memo(function PersonRowView({
  member: p,
  isHost,
  onAct,
  localImageUrl,
}: {
  member: RoomMember;
  isHost: boolean;
  onAct: (member: RoomMember, action: ModerationAction) => void;
  /** The reader's own picture, or null. Ignored for every other member. */
  localImageUrl: string | null;
}) {
  const { palette } = useTheme();
  const label = stateLabel(p, false);

  return (
    <View
      style={[styles.person, { borderBottomColor: palette.rule }]}
      accessible={!isHost || p.isLocal}
      accessibilityLabel={`${p.name}${p.isLocal ? ", you" : ""}. ${label}.`}
    >
      <Avatar
        name={p.name}
        size="sm"
        imageUrl={p.avatarUrl ?? (p.isLocal ? localImageUrl : null)}
      />

      <View style={styles.personText}>
        <Text style={[styles.personName, { color: palette.ink }]} numberOfLines={1}>
          {p.isLocal ? "You" : p.name}
        </Text>
        <Text style={[styles.personMeta, { color: palette.quiet }]}>{label}</Text>
      </View>

      {isHost && !p.isLocal ? (
        <View style={styles.actions}>
          <HostAction label="Invite" onPress={() => onAct(p, "approve_speaker")} />
          <HostAction label="Remove" danger onPress={() => onAct(p, "remove")} />
        </View>
      ) : null}
    </View>
  );
});

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
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
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
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: { minHeight: 44, minWidth: 32, justifyContent: "center" },
  topTitleWrap: { flex: 1, minWidth: 0 },
  topTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 17,
    letterSpacing: -0.2,
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
  noticeActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 2 },
  noticeBtn: { minHeight: 44, justifyContent: "center" },
  noticeBtnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  groupLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 26,
    marginBottom: 10,
  },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 14, flexWrap: "wrap" },
  hostLine: { fontFamily: fontFamilies.serifMedium, fontSize: 15, flexShrink: 1 },
  rolePill: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  /* The stage wraps, so one speaker and a dozen both lay out sensibly. */
  stage: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginBottom: 4 },
  tile: { width: 92, alignItems: "center" },
  tileName: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 13.5,
    marginTop: 7,
    textAlign: "center",
  },
  tileMeta: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9.5,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginTop: 2,
    textAlign: "center",
  },
  tileActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    flexWrap: "wrap",
  },
  personText: { flex: 1, minWidth: 90 },
  personName: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  personMeta: { fontFamily: fontFamilies.sansRegular, fontSize: 11.5, marginTop: 1 },
  /* Wraps under the name on a narrow handset rather than crushing it. */
  actions: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" },
  /* 44dp is the smallest comfortable target; these were 30. */
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 2 },
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
    paddingTop: 12,
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
