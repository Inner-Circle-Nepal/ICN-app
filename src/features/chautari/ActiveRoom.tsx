import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { isClerkConfigured } from "@/constants/config";
import { startBackgroundAudio, stopBackgroundAudio } from "@/lib/livekit/backgroundAudio";
import { isLiveKitAvailable } from "@/lib/livekit/platform";
import { useChautariRoom, type ChautariRoomState } from "./useChautariRoom";

/**
 * The Chautari room the reader is in, kept for the whole app.
 *
 * The connection used to live inside the room screen, so going Back closed
 * the screen and the connection with it: there was no way to read a story
 * while still listening. Like any live-audio app, the room now outlives the
 * screen. Back only navigates; the reader leaves with Leave or End room, and
 * `MiniRoomBar` takes them back in from anywhere.
 *
 * Only one room at a time. Entering another leaves the first.
 *
 * The room's state is published through a tiny external store rather than
 * React state on the provider: a live room re-renders several times a second
 * while people speak, and only the room screen and the mini bar should pay
 * for that, not the whole app under the provider.
 */

export interface ActiveRoomMeta {
  slug: string;
  /** Cosmetic, from the schedule, until the server's title arrives. */
  hintedTitle: string | null;
  hintedHost: string | null;
}

type Listener = () => void;

function createRoomStore() {
  let state: ChautariRoomState | null = null;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(next: ChautariRoomState | null) {
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

type RoomStore = ReturnType<typeof createRoomStore>;

interface ActiveRoomApi {
  active: ActiveRoomMeta | null;
  enter: (meta: ActiveRoomMeta) => void;
  /** Leave the room and drop the connection. */
  leave: () => void;
  store: RoomStore;
}

const ActiveRoomContext = createContext<ActiveRoomApi | null>(null);

export function ActiveRoomProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveRoomMeta | null>(null);
  const [store] = useState(createRoomStore);

  /* Bumped to force a fresh connection when re-entering a finished room. */
  const [session, setSession] = useState(0);

  const enter = useCallback(
    (meta: ActiveRoomMeta) => {
      const phase = store.get()?.phase;
      const finished = phase === "ended" || phase === "error" || phase === "left";
      setActive((prev) => {
        if (prev?.slug === meta.slug && !finished) {
          // Same live room: keep the connection, only fill in hints we lacked.
          return {
            slug: prev.slug,
            hintedTitle: prev.hintedTitle ?? meta.hintedTitle,
            hintedHost: prev.hintedHost ?? meta.hintedHost,
          };
        }
        return meta;
      });
      if (finished) setSession((n) => n + 1);
    },
    [store],
  );

  const leave = useCallback(() => {
    store.get()?.leave();
    setActive(null);
  }, [store]);

  const api = useMemo(() => ({ active, enter, leave, store }), [active, enter, leave, store]);

  return (
    <ActiveRoomContext.Provider value={api}>
      {children}
      {/*
        Keyed by slug (and session), so moving to another room, or back into
        one that has finished, tears the old connection down
        (the hook's unmount cleanup) before the new one starts. Rendered only
        in builds with accounts and native audio, the same conditions the room
        screen itself requires.
      */}
      {active && isClerkConfigured && isLiveKitAvailable() ? (
        <RoomRunner
          key={`${active.slug}:${session}`}
          slug={active.slug}
          hintedTitle={active.hintedTitle}
          store={store}
        />
      ) : null}
    </ActiveRoomContext.Provider>
  );
}

/** Holds the connection for one room and publishes its state. Renders nothing. */
function RoomRunner({
  slug,
  hintedTitle,
  store,
}: {
  slug: string;
  hintedTitle: string | null;
  store: RoomStore;
}) {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const displayName = user?.fullName?.trim() || user?.firstName?.trim() || null;

  const room = useChautariRoom(slug, getToken, displayName);

  useEffect(() => {
    store.set(room);
  });
  useEffect(() => () => store.set(null), [store]);

  /*
   * Connect once, on arrival. `leave()` lands on "left", never "idle", so a
   * room the reader left is not rejoined behind their back.
   */
  const { phase, connect } = room;
  useEffect(() => {
    if (isSignedIn && phase === "idle") connect();
  }, [isSignedIn, phase, connect]);

  /*
   * Keep the audio alive when the phone locks or the reader switches apps.
   * iOS does this by itself; on Android it takes a foreground service with an
   * ongoing notification, held for as long as the room is up.
   */
  const inRoom = phase === "connected" || phase === "reconnecting";
  const title = room.identity?.title ?? hintedTitle ?? "Chautari";
  const speaking = room.canPublish;
  useEffect(() => {
    if (inRoom) startBackgroundAudio(title, speaking);
    else stopBackgroundAudio();
  }, [inRoom, title, speaking]);
  useEffect(() => () => stopBackgroundAudio(), []);

  return null;
}

export function useActiveRoom() {
  const api = useContext(ActiveRoomContext);
  if (!api) throw new Error("useActiveRoom must be used inside ActiveRoomProvider");
  const room = useSyncExternalStore(api.store.subscribe, api.store.get, api.store.get);
  return { active: api.active, enter: api.enter, leave: api.leave, room };
}
