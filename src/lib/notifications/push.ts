import { Platform } from "react-native";
/*
 * Types only — `import type` is erased by TypeScript, so this cannot pull
 * expo-notifications into the runtime graph. The module itself is resolved
 * through the guarded accessor below, because importing it directly throws
 * in Expo Go. See ./module.ts.
 */
import type * as NotificationsNS from "expo-notifications";
import { notificationsModule } from "./module";
import * as Device from "expo-device";
import Constants from "expo-constants";
import {
  clearSecurePushToken,
  getSecurePushToken,
  setSecurePushToken,
} from "@/lib/storage/secureTokens";
import {
  getStoredNotificationsPref,
  setStoredNotificationsPref,
} from "@/lib/storage/preferences";
import { brandColors } from "@/theme/tokens";
import { registerPushToken, unregisterPushToken } from "@/lib/api/pushRegistry";

/**
 * Breaking-news notification infrastructure for Inner Circle Nepal Mobile.
 *
 * Follows the newsroom's notification philosophy in `NotificationToggle.tsx`:
 *   1. Never prompt on app launch. Permission is requested only when the reader
 *      explicitly flips the switch in Settings.
 *   2. Handle OS-level denial honestly without nagging.
 *   3. Deep-link notification taps directly to the story inside the app.
 *
 * Delivery:
 * The website sends Web Push to browsers. Phones are separate: the Expo push
 * token is registered in Supabase (`mobile_push_tokens`, via
 * `src/lib/api/pushRegistry.ts`) and the `send-breaking-push` Edge Function
 * alerts every registered phone when a story is published as breaking. See
 * supabase/README.md.
 */

/*
 * Runs at module scope by design: the handler must be registered before any
 * notification can arrive. Guarded because in Expo Go the module is absent
 * and this file is reachable from Settings.
 */
{
  const N = Platform.OS !== "web" ? notificationsModule() : null;
  N?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** The state reported when this build simply cannot do notifications. */
const UNSUPPORTED: PushNotificationState = {
  permission: "unsupported",
  enabled: false,
  deviceToken: null,
  statusNote:
    "This preview build cannot deliver notifications. Install the app from the app store to enable them.",
};

export type PushNotificationState = {
  permission: "undetermined" | "granted" | "denied" | "unsupported";
  enabled: boolean;
  deviceToken: string | null;
  statusNote: string | null;
};

export async function getPushNotificationState(): Promise<PushNotificationState> {
  if (Platform.OS === "web") {
    return {
      permission: "unsupported",
      enabled: false,
      deviceToken: null,
      statusNote: "Native push notifications require the Android or iOS app.",
    };
  }

  const N = notificationsModule();
  if (!N) return UNSUPPORTED;

  try {
    const settings = await N.getPermissionsAsync();
    const storedPref = await getStoredNotificationsPref();
    const token = await getSecurePushToken();

    const permission = settings.granted
      ? "granted"
      : settings.canAskAgain
        ? "undetermined"
        : "denied";

    return {
      permission,
      enabled: permission === "granted" && storedPref,
      deviceToken: token,
      statusNote: null,
    };
  } catch {
    return {
      permission: "undetermined",
      enabled: false,
      deviceToken: null,
      statusNote: null,
    };
  }
}

export async function enablePushNotifications(): Promise<PushNotificationState> {
  if (Platform.OS === "web") {
    return {
      permission: "unsupported",
      enabled: false,
      deviceToken: null,
      statusNote: "Native push notifications require the Android or iOS app.",
    };
  }

  const N = notificationsModule();
  if (!N) return UNSUPPORTED;

  if (Platform.OS === "android") {
    await N.setNotificationChannelAsync("breaking-news", {
      name: "Breaking news",
      description: "Significant breaking news alerts from Inner Circle Nepal",
      /*
       * AndroidImportance.HIGH === 6 in expo-notifications 58. Reached
       * through the resolved module rather than a namespace import, which
       * also sidesteps the `import/namespace` false positive the previous
       * form needed silencing for.
       */
      importance: N.AndroidImportance.HIGH,
      lightColor: brandColors.icn700,
      vibrationPattern: [0, 200, 120, 200],
    });
  }

  const current = await N.getPermissionsAsync();
  let granted = current.granted;
  let canAskAgain = current.canAskAgain;

  if (!granted) {
    const requested = await N.requestPermissionsAsync();
    granted = requested.granted;
    canAskAgain = requested.canAskAgain;
  }

  if (!granted) {
    await setStoredNotificationsPref(false);
    return {
      permission: canAskAgain ? "undetermined" : "denied",
      enabled: false,
      deviceToken: null,
      statusNote: canAskAgain
        ? null
        : "Notifications are blocked in your device settings. Allow them in system settings to receive alerts.",
    };
  }

  let token: string | null = null;
  let statusNote: string | null = null;

  if (Device.isDevice) {
    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      const pushTokenResponse = projectId
        ? await N.getExpoPushTokenAsync({ projectId })
        : await N.getDevicePushTokenAsync();
      token = String(pushTokenResponse.data);
      await setSecurePushToken(token);
      if (!(await registerPushToken(token))) {
        statusNote =
          "Alerts are on. We could not reach the newsroom just now; this phone will be registered the next time the app opens.";
      }
    } catch {
      statusNote =
        "Notification permission granted, but this phone could not get a push address. Please try again later.";
    }
  } else {
    statusNote =
      "Notification permission granted on simulator. Physical device required for a remote push token.";
  }

  await setStoredNotificationsPref(true);

  return {
    permission: "granted",
    enabled: true,
    deviceToken: token,
    statusNote,
  };
}

export async function disablePushNotifications(): Promise<PushNotificationState> {
  await setStoredNotificationsPref(false);
  const token = await getSecurePushToken();
  if (token) await unregisterPushToken(token);
  await clearSecurePushToken();

  const state = await getPushNotificationState();
  return {
    ...state,
    enabled: false,
    deviceToken: null,
    statusNote: null,
  };
}

/**
 * Re-register on launch for a reader who has alerts on.
 *
 * Expo tokens can change (reinstall, restore to a new phone), an opt-in made
 * offline never reached Supabase, and the stored language/edition may have
 * changed since. Never prompts: if permission was withdrawn in system
 * settings, the old token is removed instead. Silent on any failure.
 */
export async function syncPushRegistration(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  const N = notificationsModule();
  if (!N) return;
  try {
    if (!(await getStoredNotificationsPref())) return;
    const previous = await getSecurePushToken();

    const { granted } = await N.getPermissionsAsync();
    if (!granted) {
      if (previous) await unregisterPushToken(previous);
      return;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const current = String((await N.getExpoPushTokenAsync({ projectId })).data);

    if (previous && previous !== current) await unregisterPushToken(previous);
    if (current !== previous) await setSecurePushToken(current);
    await registerPushToken(current);
  } catch {
    // Next launch tries again.
  }
}

/**
 * Extracts a target path or slug from a notification payload when tapped.
 * Mirrors `PushPayload` in `site/src/lib/push/server.ts` (`{ path, title, body, tag }`).
 */
export function extractNotificationPath(
  response: NotificationsNS.NotificationResponse | null,
): string | null {
  const data = response?.notification?.request?.content?.data as
    | Record<string, unknown>
    | undefined;
  if (!data) return null;

  if (typeof data.path === "string" && data.path.trim()) {
    return data.path.trim();
  }
  if (typeof data.slug === "string" && data.slug.trim()) {
    return `/article/${data.slug.trim()}`;
  }
  if (typeof data.url === "string" && data.url.trim()) {
    return data.url.trim();
  }
  return null;
}
