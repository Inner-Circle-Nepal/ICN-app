import React, { useCallback } from "react";
import { useRouter } from "expo-router";

import { ProfileCompletionScreen } from "@/features/profile/ProfileCompletionScreen";

/**
 * Host route for the mandatory profile-completion gate.
 *
 * Mounts `ProfileCompletionScreen`, the presentational form, and after
 * `POST /api/reader/profile/signup` succeeds returns the reader to where they
 * were (a Chautari room they signed in to join, say), or the home tab when
 * there is nothing behind.
 * The gate itself is enforced in two places (see `app/_layout.tsx` and
 * `app/sign-in.tsx`) — this screen is where it lands them, and where the
 * route guard checks `pathname === "/profile/complete"` to avoid an
 * infinite redirect loop.
 */

export default function ProfileCompleteScreen() {
  const router = useRouter();

  const handleComplete = useCallback(() => {
    // Sign-in replaced itself with this screen, so what's behind is the
    // screen the reader started from.
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  return <ProfileCompletionScreen onComplete={handleComplete} />;
}
