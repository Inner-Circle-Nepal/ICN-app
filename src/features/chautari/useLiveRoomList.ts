import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { getPublicSupabase } from "@/lib/api/supabase";

/** Must match the channel and event in the site's supabase/2026-11-chautari-live-list.sql. */
const CHANNEL = "chautari-rooms";
const EVENT = "room_status";

/** Several rooms changing at once (a suspension ending them) cost one refetch. */
const COALESCE_MS = 500;

/**
 * Keep the Chautari room list current everywhere in the app (the tab icon
 * pulses while anything is live): a database trigger broadcasts on a public
 * Realtime channel whenever a room is created, goes live or ends, and this
 * refetches the list about half a second later.
 *
 * Listens only while the app is in the foreground: each open app holds one
 * Realtime connection, which counts against the Supabase project's
 * concurrent-connection limit (see the vault's Future changes). In the
 * background the connection is dropped; coming back
 * refetches at once and listens again, so nothing missed lingers. The poll
 * on the query stays as the fallback. Mount once (BottomNav).
 */
export function useLiveRoomUpdates(queryKey: QueryKey): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const sb = getPublicSupabase();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<NonNullable<typeof sb>["channel"]> | null = null;

    const refetch = () => void queryClient.invalidateQueries({ queryKey });

    const listen = () => {
      if (!sb || channel) return;
      channel = sb
        .channel(CHANNEL)
        .on("broadcast", { event: EVENT }, () => {
          if (timer) return;
          timer = setTimeout(() => {
            timer = null;
            refetch();
          }, COALESCE_MS);
        })
        .subscribe();
    };

    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (sb && channel) void sb.removeChannel(channel);
      channel = null;
    };

    if (AppState.currentState === "active") listen();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        refetch();
        listen();
      } else if (next === "background") {
        stop();
      }
    });

    return () => {
      sub.remove();
      stop();
    };
    // Pass a key defined once at module level, so this doesn't resubscribe.
  }, [queryClient, queryKey]);
}

/**
 * On the Chautari tab: refetch whenever the tab comes into focus. The live
 * updates themselves come from useLiveRoomUpdates, mounted app-wide.
 */
export function useLiveRoomList(queryKey: QueryKey): void {
  const queryClient = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey });
    }, [queryClient, queryKey]),
  );
}
