import { useCallback, useEffect, useRef, useState } from "react";
import { audioSession } from "@/lib/livekit/platform";
import {
  ConnectionState,
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
  | "ended"
  | "error";

export interface RoomMember {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  canPublish: boolean;
  isLocal: boolean;
}

export interface ChautariRoomState {
  phase: RoomPhase;
  error: string | null;
  /** What the server granted. Authoritative; never set from the UI. */
  role: RoomRole | null;
  canPublish: boolean;
  micEnabled: boolean;
  members: RoomMember[];
  listenerCount: number;
  connect: () => void;
  leave: () => void;
  toggleMic: () => void;
  retry: () => void;
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
  };
}

export function useChautariRoom(
  slug: string,
  getToken: GetToken,
  displayName: string | null,
): ChautariRoomState {
  const [phase, setPhase] = useState<RoomPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<RoomRole | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [members, setMembers] = useState<RoomMember[]>([]);

  const roomRef = useRef<Room | null>(null);
  /*
   * Guards against a late callback from a connection the user already left.
   * Incremented on every connect and teardown; a handler whose captured
   * generation is stale does nothing.
   */
  const generation = useRef(0);

  const syncMembers = useCallback((room: Room) => {
    const all: RoomMember[] = [
      toMember(room.localParticipant, true),
      ...[...room.remoteParticipants.values()].map((p: RemoteParticipant) => toMember(p, false)),
    ];
    setMembers(all);
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
    await audioSession.stop();

  }, []);

  const connect = useCallback(() => {
    if (phase === "connecting" || phase === "connected" || phase === "requesting") return;

    const mine = ++generation.current;
    setError(null);
    setPhase("requesting");

    void (async () => {
      try {
        /*
         * The token is requested fresh every time, including on reconnect.
         * It lives ten minutes by design, so holding one for the length of a
         * broadcast would fail exactly when someone's train went into a
         * tunnel.
         */
        const grant = await requestJoin(getToken, { roomSlug: slug, displayName });
        if (mine !== generation.current) return;

        setRole(grant.role);
        setCanPublish(grant.canPublish);
        setPhase("connecting");

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
            if (mine === generation.current) setPhase("reconnecting");
          })
          .on(RoomEvent.Reconnected, () => {
            if (mine !== generation.current) return;
            setPhase("connected");
            syncMembers(room);
          })
          .on(RoomEvent.Disconnected, () => {
            if (mine !== generation.current) return;
            /*
             * Covers the host ending the room, being removed, and the
             * network giving up after LiveKit's own retries. All three look
             * the same from here, and all three mean the same thing to a
             * listener: it is over.
             */
            setPhase("ended");
            setMembers([]);
            setMicEnabled(false);
          });

        await room.connect(grant.url, grant.token);
        if (mine !== generation.current) {
          await room.disconnect();
          return;
        }

        setPhase("connected");
        setCanPublish(Boolean(room.localParticipant.permissions?.canPublish) || grant.canPublish);
        syncMembers(room);
      } catch (e) {
        if (mine !== generation.current) return;
        const message =
          e instanceof ChautariError
            ? e.message
            : "Could not connect to this room. Please try again.";
        setError(message);
        setPhase("error");
        void teardown();
      }
    })();
  }, [phase, slug, getToken, displayName, syncMembers, teardown]);

  const leave = useCallback(() => {
    void teardown();
    setPhase("idle");
    setMembers([]);
    setMicEnabled(false);
    setRole(null);
    setCanPublish(false);
  }, [teardown]);

  const toggleMic = useCallback(() => {
    const room = roomRef.current;
    if (!room || !canPublish) return;

    const next = !room.localParticipant.isMicrophoneEnabled;
    // Optimistic, then corrected by LocalTrackPublished/Unpublished — the
    // button must not feel laggy while the track negotiates.
    setMicEnabled(next);
    void room.localParticipant.setMicrophoneEnabled(next).catch(() => {
      setMicEnabled(room.localParticipant.isMicrophoneEnabled);
    });
  }, [canPublish]);

  const retry = useCallback(() => {
    void teardown().then(() => {
      setPhase("idle");
      setError(null);
    });
  }, [teardown]);

  /* Never leave a connection, or a microphone, running past the screen. */
  useEffect(() => () => void teardown(), [teardown]);

  return {
    phase,
    error,
    role,
    canPublish,
    micEnabled,
    members,
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

export { ConnectionState };
