import React, { useCallback } from "react";
import { useRouter } from "expo-router";

import { ProfileCompletionScreen } from "@/features/profile/ProfileCompletionScreen";

/**
 * Host route for the mandatory profile-completion gate.
 *
 * Mounts `ProfileCompletionScreen`, the presentational form, and routes the
 * reader into the home tab after `POST /api/reader/profile/signup` succeeds.
 * The gate itself is enforced in two places (see `app/_layout.tsx` and
 * `app/sign-in.tsx`) — this screen is where it lands them, and where the
 * route guard checks `pathname === "/profile/complete"` to avoid an
 * infinite redirect loop.
 */

export default function ProfileCompleteScreen() {
  const router = useRouter();

  const handleComplete = useCallback(() => {
    // Replace, not push: the completion gate is not navigable history.
    router.replace("/");
  }, [router]);

  return <ProfileCompletionScreen onComplete={handleComplete} />;
}
