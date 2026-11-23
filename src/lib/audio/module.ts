/**
 * Guarded access to `expo-audio`.
 *
 * `expo-audio` is native code. A binary built before it was added (an older
 * development build, Expo Go without it) has no `ExpoAudio` module, and
 * `requireNativeModule` throws while the import is being evaluated. Imported
 * at module scope from the room screen, that would take Chautari down over a
 * clapping sound.
 *
 * So, like `src/lib/notifications/module.ts`, the require is deferred and
 * caught: a build with the module plays the sound; one without resolves to
 * `null` and the room carries on silently.
 */

export type AudioModule = typeof import("expo-audio");

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let cached: AudioModule | null | undefined;

export function audioModule(): AudioModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-audio") as AudioModule;
  } catch {
    cached = null;
  }
  return cached;
}
