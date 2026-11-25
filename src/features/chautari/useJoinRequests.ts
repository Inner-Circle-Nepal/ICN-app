import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components/Toast";
import { decideJoinRequest, getJoinRequests, type JoinRequest } from "@/lib/api/chautari";
import type { ChautariRoomState } from "./useChautariRoom";

const key = (slug: string) => ["joinRequests", slug] as const;

/**
 * For the host and moderators: the people asking to join, refreshed the
 * moment someone asks (with a toast naming them) or another moderator
 * decides. Pending requests are fetched even after the room is unlocked, so
 * nobody is left waiting unseen. Must be used inside a ClerkProvider.
 */
export function useJoinRequests(slug: string, room: ChautariRoomState, canModerate: boolean) {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { onRoomEvent } = room;
  const enabled = canModerate && room.phase === "connected";

  useEffect(() => {
    if (!enabled) return undefined;
    return onRoomEvent((event) => {
      if (event.type === "join_request") {
        toast.show({ icon: "bell", message: `${event.name} is asking to join.` });
        void qc.invalidateQueries({ queryKey: key(slug) });
      } else if (event.type === "join_requests_changed") {
        void qc.invalidateQueries({ queryKey: key(slug) });
      }
    });
  }, [enabled, onRoomEvent, qc, slug, toast]);

  const list = useQuery({
    queryKey: key(slug),
    queryFn: () => getJoinRequests(getToken, slug),
    enabled,
    staleTime: 30 * 1000,
  });

  const decide = useMutation({
    mutationFn: (vars: { requestId: string; approve: boolean }) =>
      decideJoinRequest(getToken, slug, vars.requestId, vars.approve),
    onSuccess: (remaining) => qc.setQueryData<JoinRequest[]>(key(slug), remaining),
  });

  return { list, decide };
}
