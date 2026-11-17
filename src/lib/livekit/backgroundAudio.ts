import { Platform } from "react-native";

/**
 * Keeps Chautari audio going in the background on Android.
 *
 * iOS does this through the "audio" background mode in app.json. Android
 * needs a foreground service with an ongoing notification; that service lives
 * in `modules/chautari-audio-service` and is linked into Android builds only.
 * Everywhere else (iOS, web, Expo Go, tests) these calls do nothing.
 */

interface NativeAudioService {
  start(title: string, speaking: boolean): boolean;
  stop(): void;
}

let cached: NativeAudioService | null | undefined;

function native(): NativeAudioService | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== "android") return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require("expo") as typeof import("expo");
    cached = requireOptionalNativeModule<NativeAudioService>("ChautariAudioService");
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Show the ongoing notification and keep audio alive. Safe to call again to
 * update it.
 *
 * Never asks for notification permission. On Android 13+ the ongoing card
 * stays hidden until notifications are allowed, but the service, and so the
 * audio, runs either way. Joining a room used to ask here; that spent one of
 * Android's two permission prompts on something the reader did not ask for,
 * before the prompt that matters ("Notify me" after a follow, or Settings).
 * Once permission exists for those reasons, the card simply appears.
 */
export function startBackgroundAudio(title: string, speaking: boolean): void {
  try {
    native()?.start(title, speaking);
  } catch {
    /* Refused by the OS; the room still works while the app is open. */
  }
}

export function stopBackgroundAudio(): void {
  try {
    native()?.stop();
  } catch {
    /* Not running. */
  }
}
