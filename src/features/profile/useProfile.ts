import { useQuery } from "@tanstack/react-query";

import { getProfileByUsername, type ReaderProfile } from "@/lib/api/readerProfile";

/**
 * Public profile by @handle. No authentication required.
 *
 * Returns `null` when the server returns 404 (the username is unknown). The
 * query is `enabled` only when a non-empty username is supplied, so passing
 * through a loading `params.username` from Expo Router is safe.
 */

export function profileQueryKey(username: string) {
  return ["readerProfile", username.toLowerCase()] as const;
}

export function useProfile(username: string | undefined) {
  const handle = (username ?? "").trim();
  return useQuery<ReaderProfile | null>({
    queryKey: profileQueryKey(handle),
    queryFn: () => getProfileByUsername(handle),
    enabled: handle.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
