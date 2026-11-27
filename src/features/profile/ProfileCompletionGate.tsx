import { useEffect } from "react";
import { usePathname, useRouter } from "expo-router";

import { useMyProfile } from "./useMyProfile";

/**
 * The route guard that enforces "signed in → must have a reader_profiles
 * row before using the app." Renders nothing; drives navigation.
 *
 * Fires on every pathname change and on every profile state transition.
 * The redirect is a no-op when the user is already on the completion
 * screen — otherwise we would loop. The guard catches both the cold-start
 * path (an existing reader re-opens the app) and any in-session
 * navigation path (a deep link, a notification tap, etc.) where a reader
 * without a profile ends up anywhere but completion.
 *
 * The sign-in flow in `app/sign-in.tsx` also explicitly routes a fresh
 * reader to `/profile/complete` on OTP success. This guard is the safety
 * net for every other entry path.
 *
 * Must be mounted only when `isClerkConfigured` — `useMyProfile` calls
 * Clerk's `useAuth`, which throws without a ClerkProvider.
 */

const COMPLETION_ROUTE = "/profile/complete";
const SIGN_IN_ROUTE = "/sign-in";

export function ProfileCompletionGate() {
  const { needsCompletion } = useMyProfile();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!needsCompletion) return;
    if (pathname === COMPLETION_ROUTE) return;
    // Sign-in sends a new account to completion itself. Redirecting from
    // here too raced it: both replaced the sign-in screen, and a new reader
    // got the form twice. If sign-in can't tell (the profile fetch failed),
    // it closes and this guard catches them on the next screen.
    if (pathname === SIGN_IN_ROUTE) return;
    router.replace(COMPLETION_ROUTE);
  }, [needsCompletion, pathname, router]);

  return null;
}
