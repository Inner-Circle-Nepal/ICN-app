import { requireOptionalNativeModule } from "expo";

/**
 * Guarded access to `expo-keep-awake` (stops the screen dimming and locking).
 *
 * Native code: a binary built before it was added has no `ExpoKeepAwake`
 * module, and the package's own import would throw. In development Metro
 * reports that as fatal even inside a try/catch, so the native module is
 * checked first and the package is only required when it is there. Without
 * it the screen just behaves as usual.
 */

type KeepAwake = typeof import("expo-keep-awake");

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let cached: KeepAwake | null | undefined;

function keepAwake(): KeepAwake | null {
  if (cached !== undefined) return cached;
  try {
    cached = requireOptionalNativeModule("ExpoKeepAwake")
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("expo-keep-awake") as KeepAwake)
      : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Keep the screen on until `allowScreenSleep` is called with the same tag. */
export function keepScreenOn(tag: string): void {
  void keepAwake()?.activateKeepAwakeAsync(tag).catch(() => {});
}

export function allowScreenSleep(tag: string): void {
  void keepAwake()?.deactivateKeepAwake(tag).catch(() => {});
}
