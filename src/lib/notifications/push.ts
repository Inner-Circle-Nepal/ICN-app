import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
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

/**
 * Breaking-news notification infrastructure for Inner Circle Nepal Mobile.
 *
 * Follows the newsroom's notification philosophy in `NotificationToggle.tsx`:
 *   1. Never prompt on app launch. Permission is requested only when the reader
 *      explicitly flips the switch in Settings.
 *   2. Handle OS-level denial honestly without nagging.
 *   3. Deep-link notification taps directly to the story inside the app.
 *
 * Note on backend support:
 * The website backend (`site/src/lib/push/server.ts`) currently implements
 * Web Push (`web-push` with VAPID browser endpoints in `push_subscriptions`).
 * It does not yet have an Expo Push / FCM / APNs sender service. This module
 * manages native permissions, Android notification channels, local token
 * storage in SecureStore, and deep-link navigation on tap, without inventing
 * a fake backend endpoint.
 */

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

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

  try {
    const settings = await Notifications.getPermissionsAsync();
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

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("breaking-news", {
      name: "Breaking news",
      description: "Significant breaking news alerts from Inner Circle Nepal",
      /*
       * `import/namespace` cannot follow the `export *` that re-exports this
       * enum from NotificationChannelManager.types and reports it missing.
       * It is a real runtime value — AndroidImportance.HIGH === 6 in
       * expo-notifications 58 — so the rule is silenced, not the call.
       */
      // eslint-disable-next-line import/namespace
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: brandColors.icn700,
      vibrationPattern: [0, 200, 120, 200],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  let canAskAgain = current.canAskAgain;

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
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
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getDevicePushTokenAsync();
      token = String(pushTokenResponse.data);
      await setSecurePushToken(token);
    } catch {
      statusNote =
        "Notification permission granted on this device. Remote push dispatch awaits EAS/FCM server credentials.";
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
 * Extracts a target path or slug from a notification payload when tapped.
 * Mirrors `PushPayload` in `site/src/lib/push/server.ts` (`{ path, title, body, tag }`).
 */
export function extractNotificationPath(
  response: Notifications.NotificationResponse | null,
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
