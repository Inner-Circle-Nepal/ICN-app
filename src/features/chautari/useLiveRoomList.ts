import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { getPublicSupabase } from "@/lib/api/supabase";

/** Must match the channel and event in the site's supabase/2026-11-chautari-live-list.sql. */
const CHANNEL = "chautari-rooms";
const EVENT = "room_status";

/** Several rooms changing at once (a suspension ending them) cost one refetch. */
const COALESCE_MS = 500;

/**
 * Keep the Chautari room list current: a database trigger broadcasts on a
 * public Realtime channel whenever a room is created, goes live or ends, and
 * this refetches the list the moment that happens instead of waiting for the
 * one-minute poll (which stays as the fallback).
 *
 * Only while the screen is focused: tabs stay mounted, and an idle Realtime
 * connection for every reader anywhere in the app would count against the
 * project's concurrent-connection limit. Coming back to the tab refetches,
 * so nothing missed while away lingers.
 */
export function useLiveRoomList(queryKey: QueryKey): void {
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey });

      const sb = getPublicSupabase();
      if (!sb) return undefined;

      let timer: ReturnType<typeof setTimeout> | null = null;
      const channel = sb
        .channel(CHANNEL)
        .on("broadcast", { event: EVENT }, () => {
          if (timer) return;
          timer = setTimeout(() => {
            timer = null;
            void queryClient.invalidateQueries({ queryKey });
          }, COALESCE_MS);
        })
        .subscribe();

      return () => {
        if (timer) clearTimeout(timer);
        void sb.removeChannel(channel);
      };
      // Pass a key defined once at module level, so this doesn't resubscribe.
    }, [queryClient, queryKey]),
  );
}
