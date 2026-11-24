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
import Svg, { Path } from "react-native-svg";

import {
  ChautariError,
  endRoom,
  getRoomDetails,
  moderate,
  playRoomEffect,
  setHandRaised,
  startRoom,
  type ModerationAction,
} from "@/lib/api/chautari";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { WaitingRoom } from "@/components/chautari/WaitingRoom";
import {
  END_MESSAGES,
  isBusy,
  type ChautariRoomState,
  type RoomMember,
} from "@/features/chautari/useChautariRoom";
import { useActiveRoom } from "@/features/chautari/ActiveRoom";
import { usePushNudge } from "@/features/pushNudge/context";
import { ReaderApiError, sendReport } from "@/lib/api/readerProfile";
import type { ReportReasonId, ReportTarget } from "@/features/reports/reasons";
import { getBlockedIdentities, setBlockedIdentities } from "@/lib/storage/chautariBlocks";
import { isClerkConfigured } from "@/constants/config";
import { isLiveKitAvailable } from "@/lib/livekit/platform";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing, type ThemePalette } from "@/theme/tokens";
import { ListenerTile, SpeakerTile } from "@/components/chautari/RoomTiles";
import { RoomControls } from "@/components/chautari/RoomControls";
import { InviteSheet } from "@/components/chautari/InviteSheet";
import { PersonSheet } from "@/components/chautari/PersonSheet";
import { HandsSheet } from "@/components/chautari/HandsSheet";
import { GiftSheet } from "@/components/chautari/GiftSheet";
import { GiftBurst } from "@/components/chautari/GiftBurst";
import { SupportersSheet } from "@/components/chautari/SupportersSheet";
import { SupportersStrip } from "@/components/chautari/SupportersStrip";
import { useRoomSupporters } from "@/features/chautari/useRoomSupporters";
import { useRoomGifts } from "@/features/chautari/useRoomGifts";
import { useWallet } from "@/features/wallet/useWallet";
import { ChatSheet, ChatStrip } from "@/components/chautari/RoomChat";
import { useRoomChat } from "@/features/chautari/useRoomChat";
import { useRoomEffects } from "@/features/chautari/useRoomEffects";
import { useMyProfile } from "@/features/profile/useMyProfile";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useToast } from "@/components/Toast";
import { ErrorMessage } from "@/components/ErrorMessage";

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

const LISTENER_COLUMNS = 4;

/** What the screen shows before the shared room exists: a join about to start. */
const noop = () => {};
const IDLE_ROOM: ChautariRoomState = {
  phase: "idle",
  error: null,
  errorReason: null,
  endReason: null,
  identity: null,
  role: null,
  canPublish: false,
  micEnabled: false,
  micError: null,
  micBlocked: false,
  dismissMicError: noop,
  members: [],
  listenerCount: 0,
  connect: noop,
  leave: noop,
  toggleMic: noop,
  retry: noop,
  setBlocked: noop,
  onChatPacket: () => noop,
  onEffectPacket: () => noop,
  onGiftPacket: () => noop,
};

function isRoomNotFound(e: unknown): boolean {
  return e instanceof ChautariError && e.reason === "room_not_found";
}

/**
 * Join refusals from `POST /token` (see CLAUDE.md, Chautari: Joining). The
 * server's message is the description; `retry` is whether trying again could
 * work. Reasons not listed here are treated as connection problems.
 */
const JOIN_REFUSALS: Record<string, { kicker: string; title: string; retry: boolean }> = {
  room_not_found: { kicker: "Room not found", title: "This room doesn't exist", retry: false },
  room_ended: { kicker: "Room closed", title: "This conversation has ended", retry: false },
  room_not_started: { kicker: "Not live yet", title: "This room hasn't started", retry: true },
  room_full: { kicker: "Room full", title: "This room is full", retry: true },
  removed_from_room: { kicker: "Chautari", title: "You can't rejoin this room", retry: false },
  not_signed_in: { kicker: "Chautari", title: "Sign in to join", retry: true },
  account_suspended: { kicker: "Account suspended", title: "You can't join rooms", retry: false },
};

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
      <EmptyState
        kicker="Chautari"
        title="Conversations are unavailable"
        description="This build has no account system configured."
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

  const { recordChautariOpen } = usePushNudge();
  useEffect(() => {
    if (slug) recordChautariOpen();
  }, [slug, recordChautariOpen]);

  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { isSignedIn, getToken, userId } = useAuth();
  const { user } = useUser();

  const { profile, isError: profileError, refetch: refetchProfile } = useMyProfile();
  const displayName = profile?.display_name ?? null;
  const localImageUrl = profile?.avatar_url ?? (user?.hasImage ? user.imageUrl : null);

  /*
   * The connection lives in ActiveRoomProvider, not here, so going Back keeps
   * the reader in the room (see MiniRoomBar). This screen only asks to enter
   * and reads the shared state; before that state exists it shows an idle
   * room, which renders the same "Checking your access" as a fresh join.
   */
  const { active, enter, leave: leaveRoom, room: sharedRoom } = useActiveRoom();
  const room: ChautariRoomState =
    active?.slug === slug && sharedRoom ? sharedRoom : IDLE_ROOM;

  /*
   * The hand follows the server: once the room carries it as an attribute,
   * it survives a reconnect and comes down by itself when the host answers.
   * `handFallback` covers a server that could not tell the room.
   */
  const [handFallback, setHandFallback] = useState<boolean | null>(null);
  const [handBusy, setHandBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const toast = useToast();

  const isHost = room.role === "host";
  /*
   * A moderator is appointed live, as a room attribute, so the reader's own
   * member entry is the source; the join grant only knows about it after a
   * reconnect. Display only: the server checks every action itself.
   */
  const localMember = room.members.find((m) => m.isLocal);
  const isModerator = !isHost && (localMember?.isModerator ?? room.role === "moderator");
  const canModerate = isHost || isModerator;
  const myRole = isHost ? "host" : isModerator ? "moderator" : room.canPublish ? "speaker" : "listener";
  const handRaised = handFallback ?? localMember?.handRaised ?? false;
  const title = room.identity?.title ?? hintedTitle ?? "Chautari";

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });

  const [liveAudioSupported] = useState(isLiveKitAvailable);

  /*
   * The room's public details: banner, host, moderators, and whether it is
   * live yet. A booked room shows its waiting room and is polled until
   * someone starts it, at which point the screen joins by itself.
   */
  const queryClient = useQueryClient();
  const alreadyHere = active?.slug === slug;
  const details = useQuery({
    queryKey: ["chautari-room", slug, Boolean(isSignedIn)],
    queryFn: () => getRoomDetails(slug, isSignedIn ? getToken : undefined),
    enabled: Boolean(slug),
    // A missing room is an answer, not a failure: no point asking again.
    retry: (count, e) => count < 1 && !isRoomNotFound(e),
    refetchInterval: (q) => (q.state.data?.room.status === "scheduled" ? 20_000 : false),
  });
  const roomDetails = details.data?.room ?? null;
  // The list passes the host's name along; a room opened any other way (just
  // created, a link, a notification) gets it from the room's details.
  const hostName = hintedHost ?? roomDetails?.host.name ?? null;
  const missing = !alreadyHere && isRoomNotFound(details.error);
  const waiting = !alreadyHere && roomDetails?.status === "scheduled";
  const lapsed = !alreadyHere && roomDetails?.status === "ended";
  // Do not join until we know the room is live. An older server without the
  // details endpoint errors here, and the join goes ahead as before.
  // The server names a participant from their profile once, at join. Joining
  // before the profile exists (a new reader still on the sign-up form)
  // would show them as "Guest" for the whole session.
  const readyToJoin =
    alreadyHere || (!details.isLoading && !missing && !waiting && !lapsed && profile !== null);

  useEffect(() => {
    if (!liveAudioSupported || !isSignedIn || !slug || !readyToJoin) return;
    enter({ slug, hintedTitle, hintedHost });
  }, [liveAudioSupported, isSignedIn, slug, hintedTitle, hintedHost, enter, readyToJoin]);

  const [starting, setStarting] = useState(false);
  const refreshRoom = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["chautari-room", slug] });
    void queryClient.invalidateQueries({ queryKey: ["chautari-rooms"] });
  }, [queryClient, slug]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/chautari");
  }, [router]);

  /* Leave or End room: drop the connection, then go back. */
  const leaveAndBack = useCallback(() => {
    leaveRoom();
    goBack();
  }, [leaveRoom, goBack]);

  /*
   * Back keeps a live room running. A room that ended, failed or was left
   * has nothing to keep, so Back clears it rather than leaving it behind the
   * mini bar.
   */
  const live = room.phase !== "ended" && room.phase !== "error" && room.phase !== "left";
  const back = live ? goBack : leaveAndBack;

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
      const { visible } = await setHandRaised(getTokenRef.current, {
        roomSlug: slug,
        raised: next,
        displayName,
      });
      setHandFallback(visible ? null : next);
      // The button itself shows it (red, pulsing); no message to read.
      setNotice(null);
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
        if (!res.applied) {
          toast.show({
            icon: "info",
            message: "Saved, but the change may take a moment to reach the room.",
          });
        }
      } catch (e) {
        setNotice(e instanceof ChautariError ? e.message : "Could not do that.");
      }
    },
    [slug, toast],
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

  /*
   * Report and block — available to everyone in the room, not only the host.
   *
   * Blocking is local: the reader stops hearing that person, here and in any
   * later room, without anyone else being told. Reporting goes to the
   * newsroom through the same contact pipeline as the Settings form, with
   * the room and the person's identity attached so a moderator can act.
   */
  const [blocked, setBlockedState] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    void getBlockedIdentities().then(setBlockedState);
  }, []);
  const setRoomBlocked = room.setBlocked;
  useEffect(() => {
    setRoomBlocked(blocked);
  }, [blocked, setRoomBlocked]);

  // Takes a member from the stage or the author of a chat message alike.
  const toggleBlock = useCallback((person: { identity: string }) => {
    setBlockedState((prev) => {
      const next = new Set(prev);
      if (next.has(person.identity)) next.delete(person.identity);
      else next.add(person.identity);
      void setBlockedIdentities(next);
      return next;
    });
  }, []);

  // Reports go to the newsroom's review queue; the server attaches the evidence.
  const report = useCallback((target: ReportTarget, reason: ReportReasonId, details: string) => {
    void sendReport(getTokenRef.current, target, reason, details)
      .then((message) => toast.show({ icon: "check", message }))
      .catch((e: unknown) =>
        setNotice(e instanceof ReaderApiError ? e.message : "Your report wasn't sent. Try again."),
      );
  }, [toast]);

  /*
   * Tap a person: their sheet. Host controls for the host; block and report
   * for everyone (App Store guideline 1.2: every user must be able to).
   *
   * Only the identity is held, so the sheet always shows the live member —
   * muted a moment ago, hand just raised — rather than a stale snapshot.
   */
  const [sheetIdentity, setSheetIdentity] = useState<string | null>(null);
  const openMember = useCallback((member: RoomMember) => {
    setSheetIdentity(member.identity);
  }, []);
  const sheetMember = sheetIdentity
    ? (room.members.find((m) => m.identity === sheetIdentity) ?? null)
    : null;

  const viewProfile = useCallback(
    (username: string) => {
      // The room keeps running behind the mini bar while the profile is open.
      router.push(`/user/${encodeURIComponent(username)}`);
    },
    [router],
  );

  const hands = useMemo(
    () => room.members.filter((m) => m.handRaised && !m.canPublish && !m.isLocal),
    [room.members],
  );
  const [handsOpen, setHandsOpen] = useState(false);

  /* Live chat: history on join, then whatever the server pushes into the room. */
  const chat = useRoomChat(slug, room, getToken, blocked);
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = () => {
    chat.setOpen(true);
    setChatOpen(true);
  };
  const closeChat = () => {
    chat.setOpen(false);
    setChatOpen(false);
  };
  const chatRole = isHost ? "host" : isModerator ? "moderator" : room.canPublish ? "speaker" : "listener";
  const canChat = Boolean(isSignedIn) && room.phase === "connected";

  /* Applause: the host or a moderator asks the server; every app plays it. */
  const effectLine = useRoomEffects(room);
  const [clapBusy, setClapBusy] = useState(false);
  const clap = async () => {
    if (clapBusy) return;
    setClapBusy(true);
    try {
      await playRoomEffect(getToken, slug, "clap");
    } catch (e) {
      setNotice(e instanceof ChautariError ? e.message : "Could not do that.");
    } finally {
      setClapBusy(false);
    }
  };

  /* Gifts: anyone but the host, once the server has gifts switched on. */
  const wallet = useWallet();
  const shownGift = useRoomGifts(room);
  const supporters = useRoomSupporters(slug, room);
  const [supportersOpen, setSupportersOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const canGift = Boolean(isSignedIn) && !isHost && wallet.data?.giftsEnabled === true;

  // Invite people: the host or a moderator, booked or live. Nobody running
  // the room is offered, nor the reader themselves.
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteExclude = useMemo(
    () =>
      [
        profile?.username,
        roomDetails?.host.username,
        ...(roomDetails?.moderators.map((m) => m.username) ?? []),
      ].filter((u): u is string => Boolean(u)),
    [profile?.username, roomDetails],
  );

  /*
   * A moderator has two ways out: slip away, or end the room for everyone
   * (they hold the host's controls). The host's own button always ends it.
   */
  const chooseLeave = useCallback(() => {
    Alert.alert("Leave this room?", undefined, [
      { text: "Leave quietly", onPress: leaveAndBack },
      { text: "End room for everyone", style: "destructive", onPress: confirmEnd },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [leaveAndBack, confirmEnd]);

  const speakers = useMemo(
    () =>
      room.members
        .filter((m) => m.canPublish)
        // Host first, then moderators, then everyone else on stage.
        .sort(
          (a, b) =>
            Number(b.isHost) * 2 + Number(b.isModerator) -
            (Number(a.isHost) * 2 + Number(a.isModerator)),
        ),
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

  // An old, mistyped or invented link (a shared URL, a notification for a
  // room that was since deleted). Checked first: signing in won't help.
  if (missing || !slug) {
    return (
      <Shell onBack={goBack} onShare={null} title="Chautari">
        <EmptyState
          kicker="Room not found"
          title="This room doesn't exist"
          description="The link may be mistyped, or the room may have been removed."
          actionLabel="See all rooms"
          onAction={() => router.replace("/chautari")}
        />
      </Shell>
    );
  }

  if (waiting && roomDetails) {
    const goLive = () => {
      const startEarly =
        roomDetails.scheduledFor &&
        new Date(roomDetails.scheduledFor).getTime() - Date.now() > 15 * 60_000;
      const run = () => {
        setStarting(true);
        void startRoom(getTokenRef.current, slug)
          .then(refreshRoom)
          .catch((e: unknown) =>
            Alert.alert(
              "Could not start the room",
              e instanceof ChautariError ? e.message : "Please try again.",
            ),
          )
          .finally(() => setStarting(false));
      };
      if (!startEarly) return run();
      Alert.alert("Start early?", "The room is scheduled for later. Anyone waiting will be let in now.", [
        { text: "Not yet", style: "cancel" },
        { text: "Go live now", onPress: run },
      ]);
    };
    const cancel = () =>
      Alert.alert("Cancel this room?", "It comes off the schedule for everyone.", [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel room",
          style: "destructive",
          onPress: () => {
            void endRoom(getTokenRef.current, slug)
              .then(refreshRoom)
              .then(() => router.replace("/chautari"))
              .catch((e: unknown) =>
                Alert.alert(
                  "Could not cancel",
                  e instanceof ChautariError ? e.message : "Please try again.",
                ),
              );
          },
        },
      ]);

    return (
      <Shell onBack={goBack} onShare={share} title={roomDetails.title}>
        <WaitingRoom
          room={roomDetails}
          canStart={Boolean(details.data?.canStart)}
          starting={starting}
          onGoLive={goLive}
          onCancel={cancel}
          onInvite={() => setInviteOpen(true)}
          onOpenProfile={viewProfile}
          insetsBottom={insets.bottom}
        />
        <InviteSheet
          visible={inviteOpen}
          onClose={() => setInviteOpen(false)}
          slug={slug}
          exclude={inviteExclude}
        />
      </Shell>
    );
  }

  if (lapsed) {
    return (
      <Shell onBack={goBack} onShare={null} title={title}>
        <EmptyState
          kicker="Room closed"
          title="This room did not go ahead"
          description="It was scheduled, but nobody started it, or it was cancelled."
          actionLabel="See all rooms"
          onAction={() => router.replace("/chautari")}
        />
      </Shell>
    );
  }

  if (!liveAudioSupported) {
    return (
      <Shell onBack={back} onShare={null} title={title}>
        <EmptyState
          kicker="Chautari"
          title="Live audio needs the full app"
          description="This preview build cannot play live conversations. Install Inner Circle Nepal from the app store to listen."
        />
      </Shell>
    );
  }

  if (!isSignedIn) {
    return (
      <Shell onBack={back} onShare={null} title={title}>
        <EmptyState
          kicker="Chautari"
          title="Sign in to join"
          description="Chautari rooms are open to readers with an account. Listening is free."
          actionLabel="Sign in"
          onAction={() => router.push("/sign-in")}
        />
      </Shell>
    );
  }

  if (!alreadyHere && profileError) {
    return (
      <Shell onBack={back} onShare={null} title={title}>
        <ErrorState
          title="Could not load your profile"
          message="Your name in the room comes from your profile. Check your connection and try again."
          onRetry={() => void refetchProfile()}
        />
      </Shell>
    );
  }

  if (room.phase === "left") {
    return <Shell onBack={back} onShare={null} title={title} />;
  }

  if (room.phase === "error") {
    // The server said no (full, removed, ended…): its message, and a way on
    // that fits. Anything else was the network: retry.
    const refusal = JOIN_REFUSALS[room.errorReason ?? ""];
    return (
      <Shell onBack={back} onShare={null} title={title}>
        {refusal ? (
          <EmptyState
            kicker={refusal.kicker}
            title={refusal.title}
            description={room.error ?? ""}
            actionLabel={refusal.retry ? "Try again" : "See all rooms"}
            onAction={refusal.retry ? room.retry : () => router.replace("/chautari")}
          />
        ) : (
          <ErrorState
            title="Could not join"
            message={room.error ?? "Please try again."}
            onRetry={room.retry}
          />
        )}
      </Shell>
    );
  }

  if (room.phase === "ended") {
    const copy = END_MESSAGES[room.endReason ?? "unknown"];
    return (
      <Shell onBack={back} onShare={null} title={title}>
        {room.endReason === "connection_lost" ? (
          <ErrorState title={copy.title} message={copy.message} onRetry={room.retry} />
        ) : room.endReason === "joined_elsewhere" ? (
          <EmptyState
            kicker="Chautari"
            title={copy.title}
            description={copy.message}
            actionLabel="Rejoin here"
            onAction={room.retry}
          />
        ) : (
          <EmptyState
            kicker="Room closed"
            title={copy.title}
            description={copy.message}
            actionLabel="See all rooms"
            onAction={() => router.replace("/chautari")}
          />
        )}
      </Shell>
    );
  }

  /* -------------------------------------------------------------- live */

  const onAir = room.phase === "connected" && room.identity ? ticker : null;

  return (
    <Shell onBack={back} onShare={share} title={title}>
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
            {roomDetails?.bannerUrl ? (
              <Image
                source={{ uri: roomDetails.bannerUrl }}
                style={styles.banner}
                contentFit="cover"
                transition={150}
              />
            ) : null}
            <View style={styles.headlineRow}>
              <Text style={[styles.headline, { color: palette.ink }]}>{title}</Text>
              {canModerate ? (
                <Pressable
                  onPress={() => setInviteOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Invite people to this room"
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.inviteBtn,
                    { borderColor: palette.rule2 },
                    pressed && styles.inviteBtnPressed,
                  ]}
                >
                  <InvitePersonIcon color={palette.ink} />
                </Pressable>
              ) : null}
            </View>

            {hostName || room.role ? (
              <View style={styles.identityRow}>
                {hostName ? (
                  <Text style={[styles.hostLine, { color: palette.ink2 }]} numberOfLines={1}>
                    Hosted by{" "}
                    <Text style={[styles.hostLineName, { color: palette.ink }]}>
                      {hostName}
                    </Text>
                  </Text>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                {room.role ? (
                  <View style={[styles.rolePill, { borderColor: palette.rule2 }]}>
                    <Text style={[styles.rolePillText, { color: palette.quiet }]}>
                      You · {myRole}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <SupportersStrip
              supporters={supporters.data?.supporters ?? []}
              onPress={() => setSupportersOpen(true)}
            />

            {room.micError ? (
              <ErrorMessage
                message={room.micError}
                action={
                  room.micBlocked
                    ? { label: "Open settings", onPress: () => void Linking.openSettings() }
                    : undefined
                }
                onDismiss={room.dismissMicError}
              />
            ) : null}

            {notice ? <ErrorMessage message={notice} onDismiss={() => setNotice(null)} /> : null}

            {speakers.length > 0 ? (
              <>
                <SectionHeader
                  left={`On stage · ${speakers.length}`}
                  right="Tap anyone for options"
                  palette={palette}
                />
                <View style={styles.stage}>
                  {speakers.map((m) => (
                    <SpeakerTile
                      key={m.identity}
                      member={m}
                      blocked={blocked.has(m.identity)}
                      localImageUrl={localImageUrl}
                      onPress={openMember}
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
            blocked={blocked.has(item.member.identity)}
            localImageUrl={localImageUrl}
            onPress={openMember}
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

      <PersonSheet
        member={sheetMember}
        viewerCanModerate={canModerate}
        blocked={sheetMember ? blocked.has(sheetMember.identity) : false}
        localImageUrl={localImageUrl}
        onClose={() => setSheetIdentity(null)}
        onAct={confirmAct}
        onToggleBlock={toggleBlock}
        onReport={(member, reason, details) =>
          report({ kind: "person", clerkId: member.identity, roomSlug: slug }, reason, details)
        }
        onViewProfile={viewProfile}
      />

      <InviteSheet
        visible={inviteOpen && canModerate}
        onClose={() => setInviteOpen(false)}
        slug={slug}
        exclude={inviteExclude}
      />

      <HandsSheet
        visible={handsOpen && canModerate}
        hands={hands}
        onClose={() => setHandsOpen(false)}
        onAccept={(m) => confirmAct(m, "approve_speaker")}
        onDecline={(m) => confirmAct(m, "deny_speaker")}
      />

      <SupportersSheet
        visible={supportersOpen}
        onClose={() => setSupportersOpen(false)}
        data={supporters.data}
        isLoading={supporters.isLoading}
        isError={supporters.isError}
        onRetry={() => void supporters.refetch()}
      />

      <GiftSheet
        visible={giftOpen && canGift}
        onClose={() => setGiftOpen(false)}
        roomSlug={slug}
        hostName={roomDetails?.host.name ?? null}
      />

      <ChatSheet
        visible={chatOpen}
        onClose={closeChat}
        chat={chat}
        myId={userId ?? null}
        myRole={room.role ? chatRole : null}
        canWrite={canChat}
        onBlock={(message) => toggleBlock({ identity: message.authorId })}
        onReport={(message, reason, details) =>
          report({ kind: "message", messageId: message.id, roomSlug: slug }, reason, details)
        }
        cannotWriteReason={
          isSignedIn ? "Join the room to chat." : "Sign in to join the chat."
        }
      />

      {effectLine ? (
        <View style={[styles.effectLine, { backgroundColor: palette.ink }]} pointerEvents="none">
          <Text style={[styles.effectLineText, { color: palette.paper }]}>👏 {effectLine}</Text>
        </View>
      ) : null}

      {shownGift ? <GiftBurst key={shownGift.key} gift={shownGift} /> : null}

      {room.phase === "connected" ? <ChatStrip chat={chat} onOpen={openChat} /> : null}

      <RoomControls
        isHost={isHost}
        canModerate={canModerate}
        handsCount={hands.length}
        onOpenHands={() => setHandsOpen(true)}
        canPublish={room.canPublish}
        micEnabled={room.micEnabled}
        onToggleMic={room.toggleMic}
        onEnd={confirmEnd}
        onLeave={isModerator ? chooseLeave : leaveAndBack}
        handRaised={handRaised}
        handBusy={handBusy}
        onToggleHand={() => void toggleHand()}
        onClap={() => void clap()}
        clapBusy={clapBusy}
        onGift={canGift ? () => setGiftOpen(true) : undefined}
        connected={room.phase === "connected"}
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

/** A person with a plus: invite someone. Drawn to match the top bar's 1.6 strokes. */
function InvitePersonIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3.5 20c0-3.6 2.9-6 6.5-6 1.5 0 2.9.4 4 1.2"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M18 14v6M15 17h6" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
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

/* ------------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  effectLine: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
  },
  effectLineText: { fontFamily: fontFamilies.sansMedium, fontSize: 13 },
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

  // Bleeds to the screen edges past the list's side padding.
  banner: {
    marginHorizontal: -spacing.gutter,
    marginTop: -18,
    marginBottom: 16,
    aspectRatio: 16 / 9,
  },
  headlineRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  inviteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  inviteBtnPressed: { opacity: 0.6 },
  headline: {
    flex: 1,
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
    marginTop: 8,
  },
  listenerCol: {
    marginTop: 8,
  },
  hint: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 26,
  },

  pressed: { opacity: 0.75 },
});

/* Suppress unused-import warnings for things kept intentionally. */
void ActivityIndicator;
