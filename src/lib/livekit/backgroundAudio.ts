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

let askedForNotifications = false;

/**
 * Android 13+ hides every notification, the service's included, until the
 * reader allows notifications. The audio keeps going without it, but the
 * reader cannot see or tap the ongoing "Listening in Chautari" card. Ask once
 * per app session, when they first join a room, and report whether it is
 * allowed now.
 */
async function allowNotifications(): Promise<boolean> {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return false;
  if (askedForNotifications) return false;
  askedForNotifications = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { notificationsModule } = require("@/lib/notifications/module") as typeof import("@/lib/notifications/module");
    const N = notificationsModule();
    if (!N) return false;
    const current = await N.getPermissionsAsync();
    if (current.granted) return false;
    if (!current.canAskAgain) return false;
    // Android shows the prompt only once a channel exists; same id as the service's.
    await N.setNotificationChannelAsync("chautari-live-audio", {
      name: "Chautari live audio",
      description: "Shown while you are in a Chautari conversation",
      importance: N.AndroidImportance.LOW,
      showBadge: false,
    });
    const requested = await N.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/** Show the ongoing notification and keep audio alive. Safe to call again to update it. */
export function startBackgroundAudio(title: string, speaking: boolean): void {
  const start = () => {
    try {
      native()?.start(title, speaking);
    } catch {
      /* Refused by the OS; the room still works while the app is open. */
    }
  };
  if (!native()) return;
  start();
  // Once allowed, start again so the notification is posted where it can be seen.
  void allowNotifications().then((nowAllowed) => {
    if (nowAllowed) start();
  });
}

export function stopBackgroundAudio(): void {
  try {
    native()?.stop();
  } catch {
    /* Not running. */
  }
}
