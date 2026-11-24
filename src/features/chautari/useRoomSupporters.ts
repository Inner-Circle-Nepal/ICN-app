import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getRoomSupporters } from "@/lib/api/chautari";
import type { ChautariRoomState } from "./useChautariRoom";

const key = (slug: string) => ["roomSupporters", slug] as const;

/**
 * A room's supporters (who sent gifts), refreshed whenever a gift arrives in
 * the room. The host's copy includes amounts; everyone else's is names only.
 * Must be used inside a ClerkProvider.
 */
export function useRoomSupporters(slug: string, room: ChautariRoomState) {
  const { isSignedIn, getToken } = useAuth();
  const qc = useQueryClient();
  const { onGiftPacket } = room;

  useEffect(
    () => onGiftPacket(() => void qc.invalidateQueries({ queryKey: key(slug) })),
    [onGiftPacket, qc, slug],
  );

  return useQuery({
    queryKey: key(slug),
    queryFn: () => getRoomSupporters(getToken, slug),
    enabled: Boolean(isSignedIn) && room.phase === "connected",
    staleTime: 60 * 1000,
  });
}
