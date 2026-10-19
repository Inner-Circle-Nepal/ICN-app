/**
 * Guarded access to `expo-notifications`.
 *
 * ## Why this exists
 *
 * `expo-notifications` reaches native modules from its own module body. One
 * of them, `ExpoTopicSubscriptionModule`, is not present in Expo Go on
 * Android — Expo removed remote-notification support from Expo Go in SDK 53
 * — and `requireNativeModule` throws rather than returning null:
 *
 *     Cannot find native module 'ExpoTopicSubscriptionModule'
 *
 * A plain `import * as Notifications from "expo-notifications"` therefore
 * throws while the module graph is still being evaluated. When the importer
 * is `app/_layout.tsx` that is fatal in a particular confusing way: the
 * layout never finishes evaluating, so it exports no default, and Expo
 * Router reports two misleading errors instead of the real one —
 *
 *     Route "./_layout.tsx" is missing the required default export
 *     TypeError: Cannot read property 'ErrorBoundary' of undefined
 *
 * — and the whole app fails to start, reading included, over a feature no
 * reader has asked for yet.
 *
 * This is the same failure the LiveKit platform seam exists to contain; see
 * `src/lib/livekit/platform.native.ts`.
 *
 * The require is therefore deferred and caught. In a real build it resolves
 * and notifications work exactly as before. In Expo Go it resolves to
 * `null`, every caller degrades to a no-op, and `isPushSupported()` reports
 * false so Settings can explain itself rather than appear broken.
 *
 * Types are imported separately with `import type`, which TypeScript erases,
 * so the type-level import cannot pull the module in at runtime.
 */

export type NotificationsModule = typeof import("expo-notifications");

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let cached: NotificationsModule | null | undefined;

/**
 * Resolve `expo-notifications` once, without letting it throw.
 *
 * Cached on both outcomes: the answer cannot change for the lifetime of the
 * process, and a failed require is not cheap.
 */
export function notificationsModule(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-notifications") as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Whether notifications can work in this binary at all.
 *
 * False in Expo Go on Android. A development or production build returns
 * true, which is where push is actually exercised.
 */
export function isPushSupported(): boolean {
  return notificationsModule() !== null;
}
