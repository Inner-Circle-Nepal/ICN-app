import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-expo";

import type { GetToken } from "@/lib/api/chautari";
import { linkPushToken, unlinkPushToken } from "@/lib/api/readerProfile";
import { onPushTokenRegistered } from "@/lib/notifications/tokenEvents";
import { getSecurePushToken } from "@/lib/storage/secureTokens";

/**
 * Keeps this phone's push token tied to whoever is signed in, so alerts
 * about the people they follow reach it. Renders nothing.
 *
 * Links when a reader signs in (with a token already stored) and after every
 * registration `push.ts` announces (alerts turned on, the token rotated, the
 * launch re-sync). Unlinking happens in the sign-out path, which still holds
 * a session to prove who is asking.
 *
 * Must be mounted only when `isClerkConfigured`: `useAuth` throws without a
 * ClerkProvider.
 */
export function PushAccountLink() {
  const { isSignedIn, userId, getToken } = useAuth();

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;

    const link = (token: string) => {
      if (cancelled) return;
      // Best effort: the next registration or sign-in tries again.
      linkPushToken(getToken, token).catch(() => {});
    };

    void getSecurePushToken().then((token) => {
      if (token) link(token);
    });
    const unsubscribe = onPushTokenRegistered(link);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isSignedIn, userId, getToken]);

  return null;
}

/**
 * Untie this phone from the reader, before signing out or deleting the
 * account. Never throws: a failure must not stop the sign-out, and the next
 * reader to sign in on this phone re-links it to themselves anyway.
 */
export async function releasePushToken(getToken: GetToken): Promise<void> {
  try {
    const token = await getSecurePushToken();
    if (token) await unlinkPushToken(getToken, token);
  } catch {
    // Signing out matters more than tidying the link.
  }
}
