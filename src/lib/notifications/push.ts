import { Platform } from "react-native";
import { notificationsModule } from "./module";
import * as Device from "expo-device";
import Constants from "expo-constants";
import {
  clearSecurePushToken,
  getSecurePushToken,
  setSecurePushToken,
} from "@/lib/storage/secureTokens";
import {
  getStoredAllNewsNotificationsPref,
  getStoredChautariNotificationsPref,
  getStoredNotificationsPref,
  getStoredReminderNotificationsPref,
  setStoredAllNewsNotificationsPref,
  setStoredChautariNotificationsPref,
  setStoredNotificationsPref,
  setStoredReminderNotificationsPref,
} from "@/lib/storage/preferences";
import { brandColors } from "@/theme/tokens";
import {
  registerPushToken,
  setAllNewsPushPreference,
  setBreakingPushPreference,
  setChautariPushPreference,
  setReminderPushPreference,
  unregisterPushToken,
} from "@/lib/api/pushRegistry";
import { emitPushTokenRegistered } from "./tokenEvents";

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

/*
 * Four opt-ins share one registration: breaking news, all news, Chautari
 * alerts (from the people you follow) and reminders. Any of them can be
 * turned on first, and that one asks the OS for permission; the token row
 * then carries all four preferences, and goes away only when all are off.
 *
 * All news covers breaking news: the sender sends such a phone one push per
 * story, so the breaking opt-in is kept as it was (and comes back into
 * effect when All news is turned off) but has no effect meanwhile.
 */

/** Read the four stored opt-ins. */
async function storedOptIns() {
  const [breaking, allNews, chautari, reminders] = await Promise.all([
    getStoredNotificationsPref(),
    getStoredAllNewsNotificationsPref(),
    getStoredChautariNotificationsPref(),
    getStoredReminderNotificationsPref(),
  ]);
  return {
    breaking,
    allNews,
    chautari,
    reminders,
    any: breaking || allNews || chautari || reminders,
  };
}

async function permissionGranted(): Promise<boolean> {
  const N = Platform.OS !== "web" ? notificationsModule() : null;
  if (!N) return false;
  try {
    return (await N.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Register a token with every stored opt-in. `register_push_token` creates a
 * new row with all news, Chautari and reminders off, so those are replayed
 * every time.
 */
async function registerWithOptIns(token: string): Promise<boolean> {
  const optIns = await storedOptIns();
  const ok = await registerPushToken(token, optIns.breaking);
  if (optIns.allNews) await setAllNewsPushPreference(token, true);
  if (optIns.chautari) await setChautariPushPreference(token, true);
  if (optIns.reminders) await setReminderPushPreference(token, true);
  if (ok) emitPushTokenRegistered(token);
  return ok;
}

/**
 * Ask for permission if needed (the OS prompt), make sure the Android
 * channels exist, get this phone's token and register it. Called by whichever
 * opt-in is turned on, after it has stored its own preference.
 */
async function ensureRegistered(): Promise<PushNotificationState> {
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
    await N.setNotificationChannelAsync("news", {
      name: "All news",
      description: "Every new story from Inner Circle Nepal",
      importance: N.AndroidImportance.DEFAULT,
      lightColor: brandColors.icn700,
    });
    await N.setNotificationChannelAsync("chautari-live", {
      name: "Chautari: people you follow",
      description: "When someone you follow goes live, or invites you to a room",
      importance: N.AndroidImportance.HIGH,
      lightColor: brandColors.icn700,
      vibrationPattern: [0, 150, 100, 150],
    });
    await N.setNotificationChannelAsync("reminders", {
      name: "Reminders",
      description: "Occasional nudges to come back to the newsroom",
      importance: N.AndroidImportance.LOW,
      lightColor: brandColors.icn700,
      vibrationPattern: [0, 100],
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
      if (!(await registerWithOptIns(token))) {
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

  return { permission: "granted", enabled: true, deviceToken: token, statusNote };
}

/** Remove this phone's registration once nothing on it wants alerts. */
async function unregisterIfUnused(): Promise<void> {
  if ((await storedOptIns()).any) return;
  const token = await getSecurePushToken();
  if (token) await unregisterPushToken(token);
  await clearSecurePushToken();
}

/** Breaking news on: the Settings switch and the soft-ask nudge. */
export async function enablePushNotifications(): Promise<PushNotificationState> {
  await setStoredNotificationsPref(true);
  const state = await ensureRegistered();
  if (!state.enabled) await setStoredNotificationsPref(false);
  return state;
}

export async function disablePushNotifications(): Promise<PushNotificationState> {
  await setStoredNotificationsPref(false);
  const token = await getSecurePushToken();
  if (token) await setBreakingPushPreference(token, false);
  await unregisterIfUnused();

  const state = await getPushNotificationState();
  return { ...state, enabled: false, statusNote: null };
}

/**
 * All news: a push for every new story. Includes breaking stories (sent
 * once, styled as breaking), so the reader doesn't need the breaking switch.
 */

export type AllNewsPushState = {
  enabled: boolean;
  statusNote: string | null;
};

export async function getAllNewsPushState(): Promise<AllNewsPushState> {
  const [stored, granted] = await Promise.all([
    getStoredAllNewsNotificationsPref(),
    permissionGranted(),
  ]);
  return { enabled: stored && granted, statusNote: null };
}

/** May show the OS prompt, when this is the first alert the reader turns on. */
export async function enableAllNewsPush(): Promise<AllNewsPushState> {
  await setStoredAllNewsNotificationsPref(true);
  const state = await ensureRegistered();
  if (!state.enabled) {
    await setStoredAllNewsNotificationsPref(false);
    return { enabled: false, statusNote: state.statusNote };
  }
  return { enabled: true, statusNote: state.statusNote };
}

export async function disableAllNewsPush(): Promise<AllNewsPushState> {
  await setStoredAllNewsNotificationsPref(false);
  const token = await getSecurePushToken();
  if (token) await setAllNewsPushPreference(token, false);
  await unregisterIfUnused();
  return { enabled: false, statusNote: null };
}

/**
 * Chautari alerts: the master switch over alerts from the people you follow
 * (they went live, they invited you). Which people is chosen per follow, on
 * their profile; this switch silences all of them at once.
 */

export type ChautariPushState = {
  enabled: boolean;
  statusNote: string | null;
};

export async function getChautariPushState(): Promise<ChautariPushState> {
  const [stored, granted] = await Promise.all([
    getStoredChautariNotificationsPref(),
    permissionGranted(),
  ]);
  return { enabled: stored && granted, statusNote: null };
}

/** May show the OS prompt, when this is the first alert the reader turns on. */
export async function enableChautariPush(): Promise<ChautariPushState> {
  await setStoredChautariNotificationsPref(true);
  const state = await ensureRegistered();
  if (!state.enabled) {
    await setStoredChautariNotificationsPref(false);
    return { enabled: false, statusNote: state.statusNote };
  }
  return { enabled: true, statusNote: state.statusNote };
}

export async function disableChautariPush(): Promise<ChautariPushState> {
  await setStoredChautariNotificationsPref(false);
  const token = await getSecurePushToken();
  if (token) await setChautariPushPreference(token, false);
  await unregisterIfUnused();
  return { enabled: false, statusNote: null };
}

/**
 * Reminder push preference: an occasional nudge, sent by a pg_cron-scheduled
 * Edge Function and skipped for readers who open the app anyway.
 */

export type ReminderPushState = {
  enabled: boolean;
  statusNote: string | null;
};

export async function getReminderPushState(): Promise<ReminderPushState> {
  const [stored, granted] = await Promise.all([
    getStoredReminderNotificationsPref(),
    permissionGranted(),
  ]);
  return { enabled: stored && granted, statusNote: null };
}

export async function enableReminderPush(): Promise<ReminderPushState> {
  await setStoredReminderNotificationsPref(true);
  const state = await ensureRegistered();
  if (!state.enabled) {
    await setStoredReminderNotificationsPref(false);
    return { enabled: false, statusNote: state.statusNote };
  }
  return { enabled: true, statusNote: state.statusNote };
}

export async function disableReminderPush(): Promise<ReminderPushState> {
  await setStoredReminderNotificationsPref(false);
  const token = await getSecurePushToken();
  if (token) await setReminderPushPreference(token, false);
  await unregisterIfUnused();
  return { enabled: false, statusNote: null };
}

/**
 * Re-register on launch for a reader with any alert on.
 *
 * Expo tokens can change (reinstall, restore to a new phone), an opt-in made
 * offline never reached Supabase, and the stored language/edition may have
 * changed since. It also refreshes `last_seen_at`, which is how the reminder
 * sender knows this reader opens the app anyway. Never prompts: if permission
 * was withdrawn in system settings, the old token is removed instead. Silent
 * on any failure.
 */
export async function syncPushRegistration(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  lastSyncAt = Date.now();
  const N = notificationsModule();
  if (!N) return;
  try {
    if (!(await storedOptIns()).any) return;
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
    await registerWithOptIns(current);
  } catch {
    // Next launch tries again.
  }
}

/** When this app session last re-registered; launch counts. */
let lastSyncAt = 0;
const RESUME_SYNC_EVERY_MS = 12 * 60 * 60 * 1000;

/**
 * Re-register when the app comes back to the foreground, at most every 12
 * hours. A reader who never closes the app would otherwise look absent to
 * the reminder sender (`last_seen_at` only moved on a cold start) and get
 * nudged while reading daily.
 */
export async function syncPushRegistrationOnResume(): Promise<void> {
  if (Date.now() - lastSyncAt < RESUME_SYNC_EVERY_MS) return;
  await syncPushRegistration();
}

export { extractNotificationPath } from "./path";
