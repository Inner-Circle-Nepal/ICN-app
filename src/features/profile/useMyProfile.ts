import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createProfile,
  getMyProfile,
  updateMyProfile,
  type ProfilePatch,
  type ReaderProfile,
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

export type UseMyProfileResult = {
  profile: ReaderProfile | null;
  isLoading: boolean;
  /** The request failed and there is no cached profile to show. */
  isError: boolean;
  isSignedIn: boolean;
  /** True iff signed in AND the server returned 404 for /profile/me. */
  needsCompletion: boolean;
  refetch: () => Promise<unknown>;
};

export function useMyProfile(): UseMyProfileResult {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const query = useQuery({
    queryKey: MY_PROFILE_KEY,
    queryFn: async () => {
      if (!isSignedIn) return null;
      return getMyProfile(getToken);
    },
    enabled: isLoaded && !!isSignedIn,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const profile = query.data ?? null;
  const signedIn = !!isSignedIn;

  return {
    profile,
    isLoading: signedIn && query.isLoading,
    isError: signedIn && query.isError && profile === null,
    isSignedIn: signedIn,
    // Only the server's answer "no profile" (404 → null) counts. A failed
    // request (offline, timeout, 5xx) also leaves `data` empty, and must not
    // send a reader who has a profile to the signup screen.
    needsCompletion: signedIn && query.isSuccess && query.data === null,
    refetch: query.refetch,
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
      qc.setQueryData(MY_PROFILE_KEY, profile);
    },
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
      qc.setQueryData(MY_PROFILE_KEY, profile);
      // Also refresh any public profile cache keyed on the same username.
      qc.invalidateQueries({ queryKey: ["readerProfile", profile.username] });
    },
  });
}
