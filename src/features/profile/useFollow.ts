import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type FollowStatus,
  followUser,
  getFollowStatus,
  unfollowUser,
} from "@/lib/api/readerProfile";

/**
 * Follow relationship and follower count for another reader's profile.
 *
 * Mutations run an optimistic update on `follower_count` and `is_following`
 * in the cached follow-status, so the UI reacts instantly; on error we roll
 * the optimistic change back using the snapshot captured in `onMutate`.
 *
 * Works signed-out: the follow-status query returns `is_following: false`
 * and a real follower count. The mutations require a Clerk session and will
 * throw `not_signed_in` if the reader is not signed in — callers should
 * route such a reader to `/sign-in` rather than disable the button, so the
 * tap still has an outcome.
 */

export function followStatusKey(username: string) {
  return ["followStatus", username.toLowerCase()] as const;
}

export function useFollowStatus(username: string | undefined) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const handle = (username ?? "").trim();

  return useQuery<FollowStatus | null>({
    queryKey: followStatusKey(handle),
    queryFn: () => getFollowStatus(handle, isSignedIn ? getToken : undefined),
    enabled: handle.length > 0 && isLoaded,
    staleTime: 60 * 1000,
  });
}

/**
 * Follow / unfollow mutations, each with an optimistic patch and rollback.
 *
 * The mutation receives the target username rather than closing over one,
 * so a single hook can serve a profile list / search result row later.
 */
export function useFollowMutation() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (username: string) => followUser(getToken, username),
    onMutate: async (username) => {
      await qc.cancelQueries({ queryKey: followStatusKey(username) });
      const previous = qc.getQueryData<FollowStatus | null>(followStatusKey(username));
      qc.setQueryData<FollowStatus | null | undefined>(
        followStatusKey(username),
        (prev) =>
          prev
            ? {
                ...prev,
                is_following: true,
                follower_count: prev.is_following
                  ? prev.follower_count
                  : prev.follower_count + 1,
              }
            : prev,
      );
      return { previous };
    },
    onError: (_err, username, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(followStatusKey(username), ctx.previous);
      }
    },
    onSettled: (_data, _err, username) => {
      // Always reconcile with the server's canonical count.
      void qc.invalidateQueries({ queryKey: followStatusKey(username) });
    },
  });
}

export function useUnfollowMutation() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (username: string) => unfollowUser(getToken, username),
    onMutate: async (username) => {
      await qc.cancelQueries({ queryKey: followStatusKey(username) });
      const previous = qc.getQueryData<FollowStatus | null>(followStatusKey(username));
      qc.setQueryData<FollowStatus | null | undefined>(
        followStatusKey(username),
        (prev) =>
          prev
            ? {
                ...prev,
                is_following: false,
                follower_count: prev.is_following
                  ? Math.max(0, prev.follower_count - 1)
                  : prev.follower_count,
              }
            : prev,
      );
      return { previous };
    },
    onError: (_err, username, ctx) => {
      if (ctx?.previous !== undefined) {
        qc.setQueryData(followStatusKey(username), ctx.previous);
      }
    },
    onSettled: (_data, _err, username) => {
      void qc.invalidateQueries({ queryKey: followStatusKey(username) });
    },
  });
}
