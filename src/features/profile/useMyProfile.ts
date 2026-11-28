import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createProfile,
  getMyProfile,
  updateMyProfile,
  type MyProfile,
  type MySuspension,
  type ProfilePatch,
} from "@/lib/api/readerProfile";

/**
 * The current reader's own profile row.
 *
 * `needsCompletion` is the signal the route guard in `app/_layout.tsx` and
 * the sign-in branch in `app/sign-in.tsx` key off (PR 6) — true when the
 * reader is signed in but has no `reader_profiles` row yet, which routes
 * them to `/profile/complete` before anything else in the app shows.
 *
 * MUST be called inside a `ClerkProvider` (i.e. when `isClerkConfigured` is
 * true). Callers that render in both configurations should branch on
 * `isClerkConfigured` BEFORE reaching this hook — follow the `AccountRow`
 * pattern in `app/(tabs)/settings.tsx`.
 */

export const MY_PROFILE_KEY = ["readerProfile", "me"] as const;

/**
 * One cache entry per account. An answer cached for one account (or for no
 * account) can never be read as another's: on a fresh install a "no
 * profile" stored before sign-in used to send an existing reader to the
 * signup form.
 */
export function myProfileKey(clerkUserId: string) {
  return [...MY_PROFILE_KEY, clerkUserId] as const;
}

export type UseMyProfileResult = {
  profile: MyProfile | null;
  /** The newsroom suspended this reader: everything interactive is refused. */
  suspension: MySuspension | null;
  isLoading: boolean;
  /** The request failed and there is no cached profile to show. */
  isError: boolean;
  isSignedIn: boolean;
  /** True iff signed in AND the server returned 404 for /profile/me. */
  needsCompletion: boolean;
  refetch: () => Promise<unknown>;
};

export function useMyProfile(): UseMyProfileResult {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const signedIn = isLoaded && !!isSignedIn && !!userId;

  // Only ever runs for a signed-in account, so "no profile" (null) is always
  // the server's answer about that account, never a placeholder.
  const query = useQuery({
    queryKey: myProfileKey(userId ?? ""),
    queryFn: () => {
      return getMyProfile(getToken);
    },
    enabled: signedIn,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // `query.refetch` ignores `enabled`: called while signed out it would fetch
  // (and cache) an answer for nobody.
  const { refetch: refetchQuery } = query;
  const refetch = useCallback(
    () => (signedIn ? refetchQuery() : Promise.resolve()),
    [signedIn, refetchQuery],
  );

  const profile = signedIn ? (query.data ?? null) : null;

  return {
    profile,
    suspension: profile?.suspension ?? null,
    isLoading: signedIn && query.isLoading,
    isError: signedIn && query.isError && profile === null,
    isSignedIn: signedIn,
    // Only the server's answer "no profile" (404 → null) counts. A failed
    // request (offline, timeout, 5xx) also leaves `data` empty, and must not
    // send a reader who has a profile to the signup screen.
    // Not while a fetch is in flight: after "you already have a profile" the
    // old null is still in place until the refetch lands.
    needsCompletion: signedIn && query.isSuccess && !query.isFetching && query.data === null,
    refetch,
  };
}

/* -------------------------------------------------------------------------- */
/*  Mutations                                                                  */
/* -------------------------------------------------------------------------- */

export function useCreateProfile() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: { username: string; display_name: string }) => {
      return createProfile(getToken, args);
    },
    onSuccess: (profile) => {
      qc.setQueryData(myProfileKey(profile.clerk_user_id), { ...profile, suspension: null });
    },
    // The account already has a profile: the screen treats that as success,
    // so the cached "no profile" is replaced with the real row before the
    // error reaches it (returning the promise makes the mutation wait).
    onError: (e) =>
      (e as { reason?: string }).reason === "profile_exists"
        ? qc.refetchQueries({ queryKey: MY_PROFILE_KEY })
        : undefined,
  });
}

export function useUpdateMyProfile() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      return updateMyProfile(getToken, patch);
    },
    onSuccess: (profile) => {
      qc.setQueryData<MyProfile | null>(myProfileKey(profile.clerk_user_id), (old) => ({
        ...profile,
        suspension: old?.suspension ?? null,
      }));
      // Also refresh any public profile cache keyed on the same username.
      qc.invalidateQueries({ queryKey: ["readerProfile", profile.username] });
    },
  });
}
