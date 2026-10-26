import { describe, expect, it } from "vitest";

import { isPushSupported, notificationsModule } from "@/lib/notifications/module";

/**
 * The notifications seam.
 *
 * This exists because of a real crash. `app/_layout.tsx` imported
 * `expo-notifications` at module scope. That package reaches
 * `ExpoTopicSubscriptionModule`, which is absent in Expo Go on Android
 * (Expo removed remote notifications from Expo Go in SDK 53), and
 * `requireNativeModule` throws instead of returning null.
 *
 * Because the throw happened while the module graph was still evaluating,
 * the root layout never exported a default, and Expo Router reported two
 * errors that pointed nowhere near the cause:
 *
 *     Route "./_layout.tsx" is missing the required default export
 *     TypeError: Cannot read property 'ErrorBoundary' of undefined
 *
 * The whole app failed to start over a feature no reader had asked for.
 *
 * Under Vitest's ESM runner a bare `require` is undefined, so the guarded
 * resolve always takes its failure path — which is exactly the Expo Go
 * condition being reproduced.
 *
 * Only `module.ts` is exercised here, deliberately. `push.ts` reaches
 * `react-native`, whose Flow-typed source Vitest cannot parse, so importing
 * it would fail for a reason unrelated to what is being tested. The
 * property that matters — that resolving the native module cannot throw —
 * lives entirely in this file.
 *
 * NOT asserted: that notifications work when the module IS present. That
 * needs a real build and cannot be claimed from here.
 */

describe("with the native module absent (the Expo Go case)", () => {
  it("resolves to null instead of throwing", () => {
    expect(() => notificationsModule()).not.toThrow();
    expect(notificationsModule()).toBeNull();
  });

  it("reports push as unsupported", () => {
    expect(isPushSupported()).toBe(false);
  });

  it("caches the miss without turning it into a throw", () => {
    // Both outcomes are cached; a miss must not become a throw on the
    // second call, which is what every caller after the first would hit.
    expect(isPushSupported()).toBe(false);
    expect(isPushSupported()).toBe(false);
    expect(() => notificationsModule()).not.toThrow();
  });
});
