import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  Share,
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
import { fontFamilies, spacing, type ThemePalette } from "@/theme/tokens";
import { Avatar } from "@/components/chautari/Avatar";
import { ErrorState } from "@/components/ErrorState";

/**
 * Inside a Chautari room — Direction B ("The dispatch").
 *
 * The screen reads like a live broadcast chyron over the top, with the
 * substance below:
 *
 *   ┌ ← ALL ROOMS                                       SHARE ┐
 *   │ LIVE · on air 24:16 · 51 in the room                     │  (chyron)
 *   │                                                          │
 *   │ Who pays for the new federal budget?                     │  (headline)
 *   │ Hosted by Rina Shrestha      YOU · HOST                  │
 *   │                                                          │
 *   │ ON STAGE · 4                                             │
 *   │ ⟨RS⟩  ⟨BK⟩  ⟨SG⟩  ⟨PT⟩                                    │
 *   │                                                          │
 *   │ NOW SPEAKING  Bikash Karki                               │  (red bar)
 *   │                                                          │
 *   │ READERS IN THE ROOM · 44                                 │
 *   │ ⟨…⟩ ⟨…⟩ ⟨…⟩ ⟨…⟩ ⟨…⟩                                       │  (grid)
 *   └──────────────────────────────────────────────────────────┘
 *   [ END ROOM ]                 [ ⌛ LIVE · TAP TO MUTE ]
 *
 * The screen never decides what the reader may do: `role` and `canPublish`
 * come back from the server with the join token, and the microphone button
 * only exists when the token says so. A host revoking a speaker mid-room
 * arrives as a permissions event and the button disappears.
 *
 * Deferred (requires server changes — see docs):
 *   - desk tag ("ECONOMICS DESK") in the chyron
 *   - "RE:" article tie-in in the headline area
 *   - HANDS UP · N section (no API to surface raised hands to the host)
 *   - FROM THE NEWSROOM · N section (no is-staff flag on participants)
 *   - affiliation line on NOW SPEAKING ("— finance secretary, Karnali")
 */

interface ListenerRow {
  key: string;
  member: RoomMember;
}

const LISTENER_COLUMNS = 5;

/**
 * Outer guard: isolate Clerk hooks under <ClerkProvider>.
 *
 * `_layout.tsx` only mounts <ClerkProvider> when `isClerkConfigured`. If this
 * screen called `useAuth` / `useUser` directly, an unconfigured build would
 * crash the moment the room screen mounts. The outer function renders a
 * static fallback with no hooks for that case; the actual room UI lives in
 * `ChautariRoomScreenActive`, which is mounted only when it is safe.
 */
export default function ChautariRoomScreen() {
  if (!isClerkConfigured) {
    return <ChautariUnavailable />;
  }
  return <ChautariRoomScreenActive />;
}

function ChautariUnavailable() {
  const router = useRouter();
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/chautari");
  };
  return (
    <Shell onBack={back} onShare={null} title="Chautari">
      <ErrorState
        title="Conversations are unavailable"
        message="This build has no account system configured."
      />
    </Shell>
  );
}

function ChautariRoomScreenActive() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    slug?: string | string[];
    title?: string;
    host?: string;
  }>();
  const raw = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const slug = raw ? decodeURIComponent(raw) : "";
  const hintedTitle = typeof params.title === "string" ? params.title : null;
  const hintedHost = typeof params.host === "string" && params.host ? params.host : null;

  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const displayName = user?.fullName?.trim() || user?.firstName?.trim() || null;
  const localImageUrl = user?.hasImage ? user.imageUrl : null;

  const room = useChautariRoom(slug, getToken, displayName);

  const [handRaised, setHandRaisedState] = useState(false);
  const [handBusy, setHandBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isHost = room.role === "host";
  const title = room.identity?.title ?? hintedTitle ?? "Chautari";

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const [liveAudioSupported] = useState(isLiveKitAvailable);

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

  const share = useCallback(async () => {
    try {
      const url = `https://icn.news/chautari/${encodeURIComponent(slug)}`;
      await Share.share({
        message: `Join "${title}" on Chautari: ${url}`,
        url,
        title,
      });
    } catch {
      /* Share sheet dismissed — not an error. */
    }
  }, [slug, title]);

  const toggleHand = useCallback(async () => {
    if (handBusy) return;
    setHandBusy(true);
    const next = !handRaised;
    try {
      await setHandRaised(getTokenRef.current, {
        roomSlug: slug,
        raised: next,
        displayName,
      });
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
        const res = await moderate(getTokenRef.current, {
          roomSlug: slug,
          targetUserId,
          action,
        });
        setNotice(
          res.applied ? null : "Saved, but the change may take a moment to reach the room.",
        );
      } catch (e) {
        setNotice(e instanceof ChautariError ? e.message : "Could not do that.");
      }
    },
    [slug],
  );

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

  // Hooks must come before any early returns — the ticker runs for every
  // phase, we just do not render its result until connected.
  const ticker = useOnAirTicker();

  /* ------------------------------------------------------------ gating */

  if (!liveAudioSupported) {
    return (
      <Shell onBack={leaveAndBack} onShare={null} title={title}>
        <ErrorState
          title="Live audio needs the full app"
          message="This preview build cannot play live conversations. Install Inner Circle Nepal from the app store to listen."
        />
      </Shell>
    );
  }

  if (!isSignedIn) {
    return (
      <Shell onBack={leaveAndBack} onShare={null} title={title}>
        <ErrorState
          title="Sign in to join"
          message="Chautari rooms are open to readers with an account. Listening is free."
          onRetry={() => router.push("/sign-in")}
        />
      </Shell>
    );
  }

  if (room.phase === "left") {
    return <Shell onBack={leaveAndBack} onShare={null} title={title} />;
  }

  if (room.phase === "error") {
    return (
      <Shell onBack={leaveAndBack} onShare={null} title={title}>
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
      <Shell onBack={leaveAndBack} onShare={null} title={title}>
        <ErrorState
          title={copy.title}
          message={copy.message}
          onRetry={
            room.endReason === "connection_lost" || room.endReason === "joined_elsewhere"
              ? room.retry
              : () => router.replace("/chautari")
          }
        />
      </Shell>
    );
  }

  /* -------------------------------------------------------------- live */

  const onAir = room.phase === "connected" && room.identity ? ticker : null;

  return (
    <Shell onBack={leaveAndBack} onShare={share} title={title}>
      <LiveChyron
        phase={room.phase}
        onAir={onAir}
        inRoom={room.members.length}
        palette={palette}
      />

      <FlatList
        data={listenerRows}
        keyExtractor={(r) => r.key}
        numColumns={LISTENER_COLUMNS}
        columnWrapperStyle={listenerRows.length > 0 ? styles.listenerCol : undefined}
        contentContainerStyle={styles.body}
        initialNumToRender={LISTENER_COLUMNS * 4}
        maxToRenderPerBatch={LISTENER_COLUMNS * 3}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            <Text style={[styles.headline, { color: palette.ink }]}>{title}</Text>

            {hintedHost || room.role ? (
              <View style={styles.identityRow}>
                {hintedHost ? (
                  <Text style={[styles.hostLine, { color: palette.ink2 }]} numberOfLines={1}>
                    Hosted by{" "}
                    <Text style={[styles.hostLineName, { color: palette.ink }]}>
                      {hintedHost}
                    </Text>
                  </Text>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
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
                <Text
                  style={[styles.noticeText, { color: palette.ink }]}
                  accessibilityRole="alert"
                >
                  {room.micError}
                </Text>
                <View style={styles.noticeActions}>
                  {room.micBlocked ? (
                    <Pressable
                      onPress={() => void Linking.openSettings()}
                      accessibilityRole="button"
                      accessibilityLabel="Open app settings to allow the microphone"
                      style={({ pressed }) => [
                        styles.noticeBtn,
                        pressed && styles.pressed,
                      ]}
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
                    <Text style={[styles.noticeBtnText, { color: palette.quiet }]}>
                      Dismiss
                    </Text>
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
                    <Text style={[styles.noticeBtnText, { color: palette.quiet }]}>
                      Dismiss
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {speakers.length > 0 ? (
              <>
                <SectionHeader
                  left={`On stage · ${speakers.length}`}
                  right={isHost ? "Tap a speaker to manage" : undefined}
                  palette={palette}
                />
                <View style={styles.stage}>
                  {speakers.map((m) => (
                    <SpeakerTile
                      key={m.identity}
                      member={m}
                      isHost={isHost}
                      onAct={confirmAct}
                      localImageUrl={localImageUrl}
                      palette={palette}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {listenerRows.length > 0 ? (
              <SectionHeader
                left={`Readers in the room · ${listenerRows.length}`}
                palette={palette}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <ListenerTile
            member={item.member}
            isHost={isHost}
            onAct={confirmAct}
            localImageUrl={localImageUrl}
            palette={palette}
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

      <Controls
        isHost={isHost}
        canPublish={room.canPublish}
        micEnabled={room.micEnabled}
        toggleMic={room.toggleMic}
        onEnd={confirmEnd}
        onLeave={leaveAndBack}
        handRaised={handRaised}
        handBusy={handBusy}
        onToggleHand={toggleHand}
        phase={room.phase}
        palette={palette}
        insetsBottom={insets.bottom}
      />
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The frame — top nav (All rooms + Share) wrapping any screen content.
 *
 * The chyron under it is placed BY the body (not the shell), so error-state
 * screens that don't need a chyron can still show the top nav.
 */
function Shell({
  children,
  onBack,
  onShare,
  title,
}: {
  children?: React.ReactNode;
  onBack: () => void;
  onShare: null | (() => void);
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
          accessibilityLabel="Back to all Chautari rooms"
          style={styles.topBtn}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path
              d="M19 12H5M11 6l-6 6 6 6"
              stroke={palette.ink}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={[styles.topBtnText, { color: palette.ink }]}>All rooms</Text>
        </Pressable>
        <Text
          style={[styles.topBarTitle, { color: palette.ink }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {onShare ? (
          <Pressable
            onPress={onShare}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Share this room"
            style={styles.topBtn}
          >
            <Text style={[styles.topBtnText, { color: palette.ink }]}>Share</Text>
          </Pressable>
        ) : (
          <View style={styles.topBtnSpacer} />
        )}
      </View>
      {children}
    </View>
  );
}

/* --------------------------------------------------------------- Live chyron */

function LiveChyron({
  phase,
  onAir,
  inRoom,
  palette,
}: {
  phase: string;
  onAir: string | null;
  inRoom: number;
  palette: ThemePalette;
}) {
  const parts: string[] = [];
  if (phase === "connected") parts.push("LIVE");
  else if (phase === "reconnecting") parts.push("RECONNECTING");
  else if (phase === "requesting") parts.push("CHECKING ACCESS");
  else parts.push("CONNECTING");

  if (onAir) parts.push(`on air ${onAir}`);
  if (phase === "connected" && inRoom > 0) parts.push(`${inRoom} in the room`);

  return (
    <View style={[styles.chyron, { backgroundColor: palette.ink }]}>
      <View style={[styles.chyronDot, { backgroundColor: palette.red }]} />
      <Text
        style={[styles.chyronText, { color: palette.paper }]}
        numberOfLines={1}
      >
        {parts.join(" · ")}
      </Text>
    </View>
  );
}

/**
 * Elapsed on-air time, ticking once a second.
 *
 * `start` is captured once via a useState initializer — pure, runs on first
 * render only. The label is recomputed inside the interval, so render stays
 * pure and refs/impure calls never happen during render.
 */
function useOnAirTicker(): string {
  const [start] = useState<number>(() => Date.now());
  const [label, setLabel] = useState<string>(() => formatElapsed(0));
  useEffect(() => {
    const id = setInterval(() => {
      setLabel(formatElapsed(Date.now() - start));
    }, 1000);
    return () => clearInterval(id);
  }, [start]);
  return label;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/* --------------------------------------------------------- Section header */

function SectionHeader({
  left,
  right,
  palette,
}: {
  left: string;
  right?: string;
  palette: ThemePalette;
}) {
  return (
    <View style={[styles.sectionHeader, { borderBottomColor: palette.ink }]}>
      <Text style={[styles.sectionLeft, { color: palette.ink }]}>{left}</Text>
      {right ? (
        <Text style={[styles.sectionRight, { color: palette.quiet }]}>{right}</Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------- Speaker tile */

const SpeakerTile = React.memo(function SpeakerTile({
  member: p,
  isHost,
  onAct,
  localImageUrl,
  palette,
}: {
  member: RoomMember;
  isHost: boolean;
  onAct: (member: RoomMember, action: ModerationAction) => void;
  localImageUrl: string | null;
  palette: ThemePalette;
}) {
  const speaking = p.isSpeaking && !p.isMuted;
  const label = stateLabel(p, speaking);
  const roleTint =
    speaking ? palette.red : p.isMuted ? palette.quiet : palette.ink2;

  return (
    <View
      style={styles.speakerTile}
      accessible
      accessibilityLabel={`${p.name}${p.isLocal ? ", you" : ""}. ${label}.`}
    >
      <Avatar
        name={p.name}
        size="md"
        speaking={speaking}
        imageUrl={p.avatarUrl ?? (p.isLocal ? localImageUrl : null)}
      />
      <Text style={[styles.speakerName, { color: palette.ink }]} numberOfLines={1}>
        {p.isLocal ? "You" : p.name}
      </Text>
      <View style={styles.speakerStateRow}>
        {speaking ? (
          <View style={[styles.speakingDot, { backgroundColor: palette.red }]} />
        ) : null}
        <Text style={[styles.speakerState, { color: roleTint }]}>{label}</Text>
      </View>

      {isHost && !p.isLocal ? (
        <View style={styles.speakerActions}>
          <HostAction label="Mute" onPress={() => onAct(p, "mute")} palette={palette} />
          <HostAction
            label="Demote"
            onPress={() => onAct(p, "demote_speaker")}
            palette={palette}
          />
          <HostAction
            label="Remove"
            danger
            onPress={() => onAct(p, "remove")}
            palette={palette}
          />
        </View>
      ) : null}
    </View>
  );
});

/* -------------------------------------------------------------- Listener tile */

const ListenerTile = React.memo(function ListenerTile({
  member: p,
  isHost,
  onAct,
  localImageUrl,
  palette,
}: {
  member: RoomMember;
  isHost: boolean;
  onAct: (member: RoomMember, action: ModerationAction) => void;
  localImageUrl: string | null;
  palette: ThemePalette;
}) {
  const inner = (
    <View style={styles.listenerTile}>
      <Avatar
        name={p.name}
        size="sm"
        imageUrl={p.avatarUrl ?? (p.isLocal ? localImageUrl : null)}
      />
      <Text style={[styles.listenerName, { color: palette.ink2 }]} numberOfLines={1}>
        {p.isLocal ? "You" : firstName(p.name)}
      </Text>
    </View>
  );

  if (!isHost || p.isLocal) {
    return (
      <View
        accessible
        accessibilityLabel={`${p.name}${p.isLocal ? ", you" : ""}. Listening.`}
      >
        {inner}
      </View>
    );
  }

  return (
    <Pressable
      onLongPress={() =>
        Alert.alert(p.name, "Choose an action", [
          { text: "Cancel", style: "cancel" },
          { text: "Invite to stage", onPress: () => onAct(p, "approve_speaker") },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => onAct(p, "remove"),
          },
        ])
      }
      accessibilityRole="button"
      accessibilityLabel={`${p.name}. Long-press for host actions.`}
    >
      {inner}
    </Pressable>
  );
});

function firstName(full: string): string {
  const i = full.indexOf(" ");
  return i === -1 ? full : full.slice(0, i);
}

/* ------------------------------------------------------------- Host action */

function HostAction({
  label,
  onPress,
  danger = false,
  palette,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  palette: ThemePalette;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={({ pressed }) => [styles.hostAction, pressed && styles.pressed]}
    >
      <Text style={[styles.hostActionText, { color: danger ? palette.red : palette.quiet }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ----------------------------------------------------------------- Controls */

function Controls({
  isHost,
  canPublish,
  micEnabled,
  toggleMic,
  onEnd,
  onLeave,
  handRaised,
  handBusy,
  onToggleHand,
  phase,
  palette,
  insetsBottom,
}: {
  isHost: boolean;
  canPublish: boolean;
  micEnabled: boolean;
  toggleMic: () => void;
  onEnd: () => void;
  onLeave: () => void;
  handRaised: boolean;
  handBusy: boolean;
  onToggleHand: () => void;
  phase: string;
  palette: ThemePalette;
  insetsBottom: number;
}) {
  return (
    <View
      style={[
        styles.controls,
        {
          backgroundColor: palette.paper,
          borderTopColor: palette.rule,
          paddingBottom: Math.max(12, insetsBottom),
        },
      ]}
    >
      {isHost ? (
        <Pressable
          onPress={onEnd}
          accessibilityRole="button"
          accessibilityLabel="End this room for everyone"
          style={({ pressed }) => [styles.leaveSlot, pressed && styles.pressed]}
        >
          <Text style={[styles.endText, { color: palette.red }]}>END ROOM</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          accessibilityLabel="Leave this room"
          style={({ pressed }) => [styles.leaveSlot, pressed && styles.pressed]}
        >
          <Text style={[styles.leaveText, { color: palette.quiet }]}>Leave</Text>
        </Pressable>
      )}

      {canPublish ? (
        <Pressable
          onPress={toggleMic}
          accessibilityRole="button"
          accessibilityLabel={micEnabled ? "Mute your microphone" : "Unmute your microphone"}
          accessibilityState={{ selected: micEnabled }}
          style={({ pressed }) => [
            styles.micBtn,
            {
              borderColor: palette.ink,
              backgroundColor: micEnabled ? palette.ink : "transparent",
            },
            pressed && styles.pressed,
          ]}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Rect
              x={9}
              y={3}
              width={6}
              height={11}
              rx={3}
              stroke={micEnabled ? palette.paper : palette.ink}
              strokeWidth={1.7}
            />
            <Path
              d="M5 11a7 7 0 0 0 14 0M12 18v3"
              stroke={micEnabled ? palette.paper : palette.ink}
              strokeWidth={1.7}
              strokeLinecap="round"
            />
            {!micEnabled ? (
              <Path
                d="M4 4l16 16"
                stroke={palette.ink}
                strokeWidth={1.7}
                strokeLinecap="round"
              />
            ) : null}
          </Svg>
          <Text
            style={[
              styles.micText,
              { color: micEnabled ? palette.paper : palette.ink },
            ]}
          >
            {micEnabled ? "LIVE · TAP TO MUTE" : "MUTED · TAP TO SPEAK"}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={() => void onToggleHand()}
          disabled={handBusy || phase !== "connected"}
          accessibilityRole="button"
          accessibilityLabel={handRaised ? "Lower your hand" : "Raise your hand to speak"}
          accessibilityState={{
            selected: handRaised,
            disabled: handBusy || phase !== "connected",
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
            {handBusy ? "…" : handRaised ? "HAND RAISED" : "RAISE HAND"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------- helpers */

function stateLabel(p: RoomMember, speaking: boolean): string {
  if (!p.canPublish) return "Listening";
  if (speaking) return "Speaking";
  return p.isMuted ? "Muted" : "On stage";
}

/* ------------------------------------------------------------------- styles */

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
  topBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    justifyContent: "center",
  },
  topBtnSpacer: { width: 60 },
  topBtnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  topBarTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: fontFamilies.serifMedium,
    fontSize: 15,
    letterSpacing: -0.2,
  },

  chyron: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.gutter,
    paddingVertical: 9,
    gap: 8,
  },
  chyronDot: { width: 7, height: 7, borderRadius: 3.5 },
  chyronText: {
    flex: 1,
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },

  body: { paddingHorizontal: spacing.gutter, paddingTop: 18, paddingBottom: 30 },

  headline: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },
  hostLine: { flex: 1, fontFamily: fontFamilies.serifRegular, fontSize: 14.5 },
  hostLineName: { fontFamily: fontFamilies.serifMedium },
  rolePill: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  rolePillText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },

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

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 24,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  sectionLeft: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  sectionRight: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    letterSpacing: 0.6,
  },

  stage: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    marginTop: 14,
  },
  speakerTile: { width: 92, alignItems: "center" },
  speakerName: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 13.5,
    marginTop: 8,
    textAlign: "center",
  },
  speakerStateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 3,
  },
  speakingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  speakerState: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9.5,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    textAlign: "center",
  },
  speakerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginTop: 6,
  },

  listenerCol: {
    gap: 10,
    marginTop: 12,
  },
  listenerTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  listenerName: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },

  hostAction: { minHeight: 32, paddingHorizontal: 2, justifyContent: "center" },
  hostActionText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10,
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
    gap: 12,
  },
  leaveSlot: {
    minHeight: 48,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  endText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  leaveText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  micBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  micText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  pressed: { opacity: 0.75 },
});

/* Suppress unused-import warnings for things kept intentionally. */
void ActivityIndicator;
