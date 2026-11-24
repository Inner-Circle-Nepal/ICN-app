import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-expo";

import { billing } from "@/lib/billing";

/**
 * Keeps the billing provider's idea of "who is buying" equal to the signed-in
 * reader. Purchases are credited to that Clerk id by the server, so a
 * purchase made under the wrong id would land in the wrong wallet. Renders
 * nothing.
 *
 * Must be mounted only when `isClerkConfigured`: `useAuth` throws without a
 * ClerkProvider.
 */
export function BillingIdentity() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const identified = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !billing.available) return;
    if (isSignedIn && userId) {
      if (identified.current === userId) return;
      identified.current = userId;
      billing.identify(userId).catch(() => {
        // Tried again on the next sign-in; buying waits for it (useBuyCoins).
        identified.current = null;
      });
    } else if (identified.current) {
      identified.current = null;
      void billing.reset();
    }
  }, [isLoaded, isSignedIn, userId]);

  return null;
}
