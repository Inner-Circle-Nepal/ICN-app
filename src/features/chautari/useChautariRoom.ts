import { useCallback, useEffect, useRef, useState } from "react";
import { audioSession } from "@/lib/livekit/platform";
import {
  ConnectionState,
  DisconnectReason,
  MediaDeviceFailure,
  Room,
  RoomEvent,
  type Participant,
  type RemoteParticipant,
} from "livekit-client";
import { ChautariError, requestJoin, type GetToken, type RoomRole } from "@/lib/api/chautari";

/**
 * Being in a live room.
 *
 * Drives `livekit-client`'s `Room` directly rather than using
 * `@livekit/components-react`: that library exists to provide prefab UI, and
 * this app has its own design system down to the hairline. Owning the Room
 * instance also means owning reconnection and teardown, which is where the
 * failures a listener actually notices live.
 *
 * The app never decides what it may do. It asks the server for a token, and
 * the token says. `canPublish` below is read back from the grant, not chosen
 * here — a bug in this file cannot hand someone a microphone.
 */

export type RoomPhase =
  | "idle"
  | "requesting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "left"
  | "ended"
  | "error";

/**
 * Why a connection finished, when LiveKit tells us.
 *
 * These used to be one `"ended"` phase carrying the text "The host closed the
 * room, or the connection was lost for too long" — honest, but it made three
 * very different events indistinguishable to the reader. Being removed by a
 * host and losing signal in a tunnel deserve different sentences.
 */
export type EndReason =
  | "host_ended"
  | "removed"
  | "connection_lost"
  | "joined_elsewhere"
  | "unknown";

export interface RoomMember {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  canPublish: boolean;
  isLocal: boolean;
  /**
   * Their picture, when the server put one in the token.
   *
   * Null for a reader who has set no photograph, and null for everyone when
   * the backend predates this field — the avatar falls back to initials in
   * both cases, which is what it drew before.
   */
  avatarUrl: string | null;
}

/** Identity of the room itself, as the SERVER reported it with the grant. */
export interface RoomIdentity {
  slug: string;
  title: string;
  status: "scheduled" | "live" | "ended";
}

export interface ChautariRoomState {
  phase: RoomPhase;
  error: string | null;
  endReason: EndReason | null;
  /**
   * The room the server actually let us into. Null until the grant arrives.
   * Display only — never consulted for permission.
   */
  identity: RoomIdentity | null;
  /** What the server granted. Authoritative; never set from the UI. */
  role: RoomRole | null;
  canPublish: boolean;
  micEnabled: boolean;
  /** Why the microphone could not be turned on, in words a reader can act on. */
  micError: string | null;
  /** True only for a denied OS permission, which Settings can fix. */
  micBlocked: boolean;
  dismissMicError: () => void;
  members: RoomMember[];
  listenerCount: number;
  connect: () => void;
  leave: () => void;
  toggleMic: () => void;
  retry: () => void;
}

/**
 * The avatar a participant is carrying, if any.
 *
 * `metadata` is a free-form string that LiveKit relays verbatim, so every
 * assumption about it has to be checked here: it can be absent, it can be a
 * leftover shape from an older server, and on a self-hosted deployment it can
 * be something another tool wrote. A parse failure is not worth a log line or
 * a thrown error — it means this person is drawn from their initials, exactly
 * as they were before the field existed.
 *
 * Only `http(s)` is accepted. The URL goes straight into an `<Image source>`,
 * and `data:` or `file:` arriving from a room full of strangers is not
 * something to hand to the image loader.
 */
function avatarFromMetadata(metadata?: string): string | null {
  if (!metadata) return null;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (typeof parsed !== "object" || parsed === null) return null;
    const avatar = (parsed as { avatar?: unknown }).avatar;
    if (typeof avatar !== "string") return null;
    const trimmed = avatar.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}

function toMember(p: Participant, isLocal: boolean): RoomMember {
  const micTrack = [...p.audioTrackPublications.values()][0];
  return {
    identity: p.identity,
    name: p.name?.trim() || p.identity,
    isSpeaking: p.isSpeaking,
    // No publication at all reads as muted: nothing is being heard either way.
    isMuted: micTrack ? micTrack.isMuted : true,
    canPublish: Boolean(p.permissions?.canPublish),
    isLocal,
    avatarUrl: avatarFromMetadata(p.metadata),
  };
}

/** Field-by-field equality, so an unchanged participant keeps its object. */
function sameMember(a: RoomMember, b: RoomMember): boolean {
  return (
    a.identity === b.identity &&
    a.name === b.name &&
    a.isSpeaking === b.isSpeaking &&
    a.isMuted === b.isMuted &&
    a.canPublish === b.canPublish &&
    a.isLocal === b.isLocal &&
    a.avatarUrl === b.avatarUrl
  );
}

function endReasonFrom(reason?: DisconnectReason): EndReason {
  switch (reason) {
    case DisconnectReason.ROOM_DELETED:
    case DisconnectReason.ROOM_CLOSED:
      return "host_ended";
    case DisconnectReason.PARTICIPANT_REMOVED:
      return "removed";
    /*
     * `DUPLICATE_IDENTITY` (= 2 in @livekit/protocol 1.52.1): "another
     * participant with the same identity has joined the room". The LiveKit
     * identity is the canonical user id, so this is the same reader opening
     * the room on a second device — the older session is the one dropped.
     *
     * It used to fall through to "unknown" and tell them the conversation
     * had ended. It had not; it is still running, on their other handset.
     */
    case DisconnectReason.DUPLICATE_IDENTITY:
      return "joined_elsewhere";
    case DisconnectReason.SIGNAL_CLOSE:
    case DisconnectReason.STATE_MISMATCH:
    case DisconnectReason.SERVER_SHUTDOWN:
      return "connection_lost";
    default:
      return "unknown";
  }
}

function micFailureMessage(error: unknown): { message: string; blocked: boolean } {
  switch (MediaDeviceFailure.getFailure(error)) {
    case MediaDeviceFailure.PermissionDenied:
      return {
        message:
          "Inner Circle Nepal does not have permission to use your microphone. " +
          "Allow it in Settings to speak.",
        blocked: true,
      };
    case MediaDeviceFailure.NotFound:
      return { message: "No microphone was found on this device.", blocked: false };
    case MediaDeviceFailure.DeviceInUse:
      return {
        message: "Your microphone is being used by another app. Close it and try again.",
        blocked: false,
      };
    default:
      return { message: "Your microphone could not be turned on.", blocked: false };
  }
}

export function useChautariRoom(
  slug: string,
  getToken: GetToken,
  displayName: string | null,
): ChautariRoomState {
  const [phase, setPhase] = useState<RoomPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<EndReason | null>(null);
  const [identity, setIdentity] = useState<RoomIdentity | null>(null);
  const [role, setRole] = useState<RoomRole | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [micBlocked, setMicBlocked] = useState(false);
  const [members, setMembers] = useState<RoomMember[]>([]);

  const roomRef = useRef<Room | null>(null);

  /*
   * Guards against a late callback from a connection the user already left.
   * Incremented on every connect and teardown; a handler whose captured
   * generation is stale does nothing.
   */
  const generation = useRef(0);

  /*
   * The phase, readable synchronously.
   *
   * `connect` used to close over the `phase` STATE for its re-entry guard,
   * which put `phase` in its dependency list and gave the callback a new
   * identity on every transition. The screen's connect-effect depended on the
   * returned object, so it re-ran constantly; combined with `leave()` setting
   * the phase back to "idle", a deliberate leave immediately reconnected —
   * a fresh token request, a new Room and a participant upsert on every exit.
   *
   * Reading the phase from a ref keeps `connect` stable for the life of a
   * slug, so the effect can depend on it safely.
   */
  const phaseRef = useRef<RoomPhase>("idle");
  const setPhaseSafely = useCallback((next: RoomPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /*
   * THE GUARD, in one sentence: leaving lands on "left", and only "idle"
   * invites an automatic connection.
   *
   * There is deliberately no second flag tracking "the user left". One was
   * tried and removed: it was written by `leave()` and `connect()` and read
   * by nothing, which is worse than useless — it looked like protection, so
   * the phase could have been "simplified" back to "idle" by someone who
   * believed the flag was doing the work.
   *
   * The phase is the single source of truth. Three rules keep it honest:
   *
   *   - `leave()` sets "left", never "idle".
   *   - the screen's auto-connect effect fires only on "idle".
   *   - `connect()` and `retry()` are the only ways back, and both are
   *     explicit user actions.
   *
   * `tests/chautariRoom.test.tsx` fails on all three if any is undone.
   */

  /*
   * Latest inputs without rebuilding the callbacks.
   *
   * `getToken` comes from Clerk's `useAuth()` and is not guaranteed stable
   * across renders; `displayName` changes when the profile loads. Neither
   * should change the identity of `connect`.
   */
  const getTokenRef = useRef(getToken);
  const displayNameRef = useRef(displayName);

  /** Previous members, so unchanged rows keep their object identity. */
  const membersRef = useRef<RoomMember[]>([]);

  /**
   * Rebuild the member list, reusing objects for anyone who did not change.
   *
   * `ActiveSpeakersChanged` fires continuously during a real conversation.
   * Allocating a fresh object per participant each time made every row a new
   * reference, so a memoised row could never skip a render and a 200-person
   * room re-rendered in full several times a second. Only the people whose
   * state actually changed get a new object now.
   */
  const syncMembers = useCallback((room: Room) => {
    const next: RoomMember[] = [
      toMember(room.localParticipant, true),
      ...[...room.remoteParticipants.values()].map((p: RemoteParticipant) => toMember(p, false)),
    ];

    const prev = membersRef.current;
    const byIdentity = new Map(prev.map((m) => [m.identity, m]));

    let changed = next.length !== prev.length;
    const reconciled = next.map((m, i) => {
      const old = byIdentity.get(m.identity);
      if (old && sameMember(old, m)) {
        if (prev[i] !== old) changed = true; // same person, different position
        return old;
      }
      changed = true;
      return m;
    });

    if (!changed) return; // Nothing to tell React about.
    membersRef.current = reconciled;
    setMembers(reconciled);
  }, []);

  const teardown = useCallback(async () => {
    generation.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      try {
        await room.disconnect();
      } catch {
        // Already gone.
      }
    }
    membersRef.current = [];
    await audioSession.stop();
  }, []);

  const connect = useCallback(() => {
    const current = phaseRef.current;
    if (current === "connecting" || current === "connected" || current === "requesting") return;

    /*
     * Reachable from "idle", "left", "ended" and "error" — every one of them
     * a deliberate act by the reader, never an effect firing on its own.
     */
    const mine = ++generation.current;
    setError(null);
    setEndReason(null);
    setPhaseSafely("requesting");

    void (async () => {
      try {
        /*
         * The token is requested fresh every time, including on reconnect.
         * It lives ten minutes by design, so holding one for the length of a
         * broadcast would fail exactly when someone's train went into a
         * tunnel.
         */
        const grant = await requestJoin(getTokenRef.current, {
          roomSlug: slug,
          displayName: displayNameRef.current,
        });
        if (mine !== generation.current) return;

        setRole(grant.role);
        setCanPublish(grant.canPublish);
        // The server's own name for this room. Display only.
        if (grant.room) setIdentity(grant.room);
        setPhaseSafely("connecting");

        // Must precede connect: the OS audio route is configured here, and
        // on Android a missing session means no sound at all.
        await audioSession.start();
        if (mine !== generation.current) return;

        const room = new Room({
          // Audio only — there is no video anywhere in this product.
          adaptiveStream: false,
          dynacast: false,
        });
        roomRef.current = room;

        room
          .on(RoomEvent.ParticipantConnected, () => syncMembers(room))
          .on(RoomEvent.ParticipantDisconnected, () => syncMembers(room))
          .on(RoomEvent.TrackPublished, () => syncMembers(room))
          .on(RoomEvent.TrackUnpublished, () => syncMembers(room))
          .on(RoomEvent.TrackMuted, () => syncMembers(room))
          .on(RoomEvent.TrackUnmuted, () => syncMembers(room))
          .on(RoomEvent.ActiveSpeakersChanged, () => syncMembers(room))
          /* A picture set or cleared mid-room, relayed by LiveKit. */
          .on(RoomEvent.ParticipantMetadataChanged, () => syncMembers(room))
          .on(RoomEvent.LocalTrackPublished, () => {
            setMicEnabled(room.localParticipant.isMicrophoneEnabled);
            syncMembers(room);
          })
          .on(RoomEvent.LocalTrackUnpublished, () => {
            setMicEnabled(room.localParticipant.isMicrophoneEnabled);
            syncMembers(room);
          })
          /*
           * A host can revoke a speaker mid-room. The permissions change
           * arrives here, and the mic button must disappear immediately
           * rather than at the next reconnect.
           */
          .on(RoomEvent.ParticipantPermissionsChanged, () => {
            setCanPublish(Boolean(room.localParticipant.permissions?.canPublish));
            setMicEnabled(room.localParticipant.isMicrophoneEnabled);
            syncMembers(room);
          })
          .on(RoomEvent.Reconnecting, () => {
            if (mine === generation.current) setPhaseSafely("reconnecting");
          })
          .on(RoomEvent.Reconnected, () => {
            if (mine !== generation.current) return;
            setPhaseSafely("connected");
            syncMembers(room);
          })
          .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
            if (mine !== generation.current) return;
            /*
             * CLIENT_INITIATED is our own `leave()` or teardown completing.
             * It is not an ending worth a screen — the user already knows.
             */
            if (reason === DisconnectReason.CLIENT_INITIATED) return;
            setEndReason(endReasonFrom(reason));
            setPhaseSafely("ended");
            membersRef.current = [];
            setMembers([]);
            setMicEnabled(false);
          });

        await room.connect(grant.url, grant.token);
        if (mine !== generation.current) {
          await room.disconnect();
          return;
        }

        setPhaseSafely("connected");
        setCanPublish(Boolean(room.localParticipant.permissions?.canPublish) || grant.canPublish);
        syncMembers(room);
      } catch (e) {
        if (mine !== generation.current) return;
        const message =
          e instanceof ChautariError
            ? e.message
            : "Could not connect to this room. Please try again.";
        setError(message);
        setPhaseSafely("error");
        void teardown();
      }
    })();
  }, [slug, syncMembers, teardown, setPhaseSafely]);

  /** Explicit connect, used by `retry` without making `connect` self-referential. */
  const connectRef = useRef(connect);

  /*
   * The three "latest value" refs are synced after render, not during it.
   *
   * Writing a ref in the render body is what `react-hooks/refs` forbids, and
   * for a real reason: a render that React throws away would still have
   * mutated it. Every reader of these runs later — inside a callback, an
   * effect or a LiveKit event — so updating them here is both legal and
   * early enough.
   */
  useEffect(() => {
    getTokenRef.current = getToken;
    displayNameRef.current = displayName;
    connectRef.current = connect;
  });

  const leave = useCallback(() => {
    void teardown();
    /* "left", not "idle" — see the guard note above `phaseRef`. */
    setPhaseSafely("left");
    setMembers([]);
    setMicEnabled(false);
    setMicError(null);
    setMicBlocked(false);
    setRole(null);
    setCanPublish(false);
  }, [teardown, setPhaseSafely]);

  const toggleMic = useCallback(() => {
    const room = roomRef.current;
    if (!room || !canPublish) return;

    const next = !room.localParticipant.isMicrophoneEnabled;
    setMicError(null);
    setMicBlocked(false);
    // Optimistic, then corrected by LocalTrackPublished/Unpublished — the
    // button must not feel laggy while the track negotiates.
    setMicEnabled(next);
    void room.localParticipant.setMicrophoneEnabled(next).catch((e: unknown) => {
      /*
       * Reverting silently was the old behaviour, and it is the reason this
       * exists: a reader who had denied the microphone permission tapped the
       * button, watched it flip back, and had nothing to act on. The button
       * must never imply a live microphone it does not have.
       */
      setMicEnabled(room.localParticipant.isMicrophoneEnabled);
      if (next) {
        const { message, blocked } = micFailureMessage(e);
        setMicError(message);
        setMicBlocked(blocked);
      }
    });
  }, [canPublish]);

  const dismissMicError = useCallback(() => {
    setMicError(null);
    setMicBlocked(false);
  }, []);

  const retry = useCallback(() => {
    void teardown().then(() => {
      setError(null);
      setEndReason(null);
      setPhaseSafely("idle");
      connectRef.current();
    });
  }, [teardown, setPhaseSafely]);

  /* Never leave a connection, or a microphone, running past the screen. */
  useEffect(() => () => void teardown(), [teardown]);

  return {
    phase,
    error,
    endReason,
    identity,
    role,
    canPublish,
    micEnabled,
    micError,
    micBlocked,
    dismissMicError,
    members,
    /*
     * Only the participants THIS client has been told about. On a large room
     * that is not the same number the server would report, which is why the
     * screen labels it "in the room" rather than quoting it as the audience.
     */
    listenerCount: members.filter((m) => !m.canPublish).length,
    connect,
    leave,
    toggleMic,
    retry,
  };
}

/** True when the connection is in a state the reader should see a spinner for. */
export function isBusy(phase: RoomPhase): boolean {
  return phase === "requesting" || phase === "connecting" || phase === "reconnecting";
}

/** What to tell the reader when a room finishes without them asking. */
export const END_MESSAGES: Record<EndReason, { title: string; message: string }> = {
  host_ended: {
    title: "This conversation has ended",
    message: "The host closed the room.",
  },
  removed: {
    title: "You were removed from this room",
    message: "A host removed you from this conversation.",
  },
  connection_lost: {
    title: "Connection lost",
    message: "We could not keep you connected to this room. Check your signal and try again.",
  },
  joined_elsewhere: {
    title: "You joined from another device",
    message:
      "This conversation is still running — you opened it somewhere else, and a room can only " +
      "hold one of you. Carry on there, or rejoin here to move the conversation to this device.",
  },
  unknown: {
    title: "This conversation has ended",
    message: "The room closed, or the connection was lost for too long.",
  },
};

export { ConnectionState };
