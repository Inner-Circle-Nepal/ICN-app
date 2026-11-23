import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  enablePushNotifications,
  getAllNewsPushState,
  getPushNotificationState,
} from "@/lib/notifications/push";

/**
 * Push-notification nudge: a passive dot on the Settings tab and a
 * contextual bottom sheet that fires after the reader has shown intent
 * (opened a few articles, or joined a Chautari room).
 *
 * Soft ask before hard ask. Tapping "Enable" in the sheet triggers the
 * OS permission prompt via `enablePushNotifications`; the OS prompt is
 * never fired cold, so a cold decline never shuts us out of asking
 * again. The sheet itself is capped at two showings with a 14-day
 * cool-down between them; a second "Not now" silences the nudge for
 * good.
 *
 * Both triggers set a pending flag rather than opening the sheet right
 * then — the sheet renders only on tab routes, so opening an article
 * never buries it under the article view.
 */

const STORAGE_KEYS = {
  articleCount: "icn-nudge-article-count",
  /*
   * True once the reader has flipped ANY of the three notification
   * toggles (breaking, Chautari, reminders) in either direction. The
   * tab-bar dot is tied to this rather than to "has visited Settings,"
   * so existing readers — who have visited Settings many times without
   * ever engaging with the notification rows — still see the dot until
   * they actually make a decision.
   *
   * A disable counts too: respect the decision, don't keep nagging.
   */
  notificationsInteracted: "icn-nudge-notifications-interacted",
  lastShownAt: "icn-nudge-last-shown-at",
  declineCount: "icn-nudge-decline-count",
  silenced: "icn-nudge-silenced",
} as const;

const ARTICLE_THRESHOLD = 3;
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SHOWINGS = 2;

type NudgeContextValue = {
  /** True when the Settings tab should carry a small unread dot. */
  showSettingsDot: boolean;
  /** True when a pending sheet should render (consumer also checks route). */
  pendingSheet: boolean;
  /** Called from article detail; bumps the lifetime count. */
  recordArticleOpen: () => void;
  /** Called from a Chautari room; counts as immediate intent. */
  recordChautariOpen: () => void;
  /** Called when any notification toggle is flipped; clears the dot. */
  markNotificationsInteracted: () => void;
  /** Soft-ask "Enable" → real OS prompt. */
  acceptNudge: () => Promise<void>;
  /** Soft-ask "Not now" → cool-down or silence. */
  declineNudge: () => Promise<void>;
};

const NudgeContext = createContext<NudgeContextValue | null>(null);

export function PushNudgeProvider({ children }: { children: React.ReactNode }) {
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [notificationsInteracted, setNotificationsInteracted] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [lastShownAt, setLastShownAt] = useState<number | null>(null);
  const [declineCount, setDeclineCount] = useState(0);
  const [articleCount, setArticleCount] = useState(0);
  const [pendingSheet, setPendingSheet] = useState(false);

  // Set once the initial AsyncStorage read is done, so we don't fire a
  // sheet based on half-loaded state.
  const hydratedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const [
        pushState,
        rawInteracted,
        rawLast,
        rawDecline,
        rawSilenced,
        rawArticles,
      ] = await Promise.all([
        // News alerts count as on with either switch: All news covers
        // breaking, so its readers shouldn't be asked to turn breaking on.
        Promise.all([getPushNotificationState(), getAllNewsPushState()]).then(
          ([breaking, allNews]) => ({ enabled: breaking.enabled || allNews.enabled }),
        ),
        AsyncStorage.getItem(STORAGE_KEYS.notificationsInteracted),
        AsyncStorage.getItem(STORAGE_KEYS.lastShownAt),
        AsyncStorage.getItem(STORAGE_KEYS.declineCount),
        AsyncStorage.getItem(STORAGE_KEYS.silenced),
        AsyncStorage.getItem(STORAGE_KEYS.articleCount),
      ]);
      setPushEnabled(pushState.enabled);
      setNotificationsInteracted(rawInteracted === "true");
      setLastShownAt(rawLast ? Number(rawLast) : null);
      setDeclineCount(rawDecline ? Number(rawDecline) : 0);
      setSilenced(rawSilenced === "true");
      setArticleCount(rawArticles ? Number(rawArticles) : 0);
      hydratedRef.current = true;
    })();
  }, []);

  const eligibleForSheet = useCallback(
    (nextArticleCount: number, forceByChautari = false): boolean => {
      if (!hydratedRef.current) return false;
      if (pushEnabled) return false;
      if (silenced) return false;
      if (declineCount >= MAX_SHOWINGS) return false;
      if (lastShownAt && Date.now() - lastShownAt < COOLDOWN_MS) return false;
      if (forceByChautari) return true;
      return nextArticleCount >= ARTICLE_THRESHOLD;
    },
    [pushEnabled, silenced, declineCount, lastShownAt],
  );

  const recordArticleOpen = useCallback(() => {
    setArticleCount((prev) => {
      const next = prev + 1;
      void AsyncStorage.setItem(STORAGE_KEYS.articleCount, String(next));
      if (eligibleForSheet(next)) setPendingSheet(true);
      return next;
    });
  }, [eligibleForSheet]);

  const recordChautariOpen = useCallback(() => {
    if (eligibleForSheet(articleCount, true)) setPendingSheet(true);
  }, [eligibleForSheet, articleCount]);

  const markNotificationsInteracted = useCallback(() => {
    if (notificationsInteracted) return;
    setNotificationsInteracted(true);
    void AsyncStorage.setItem(STORAGE_KEYS.notificationsInteracted, "true");
  }, [notificationsInteracted]);

  const acceptNudge = useCallback(async () => {
    setPendingSheet(false);
    const now = Date.now();
    setLastShownAt(now);
    void AsyncStorage.setItem(STORAGE_KEYS.lastShownAt, String(now));
    // Tapping Enable in the soft-ask is itself an interaction — mark the
    // dot consumed up front, independent of whether the OS prompt grants.
    setNotificationsInteracted(true);
    void AsyncStorage.setItem(STORAGE_KEYS.notificationsInteracted, "true");
    // Hard ask: this is what actually pops the OS dialog.
    const res = await enablePushNotifications();
    setPushEnabled(res.enabled);
  }, []);

  const declineNudge = useCallback(async () => {
    setPendingSheet(false);
    const now = Date.now();
    setLastShownAt(now);
    const nextDecline = declineCount + 1;
    setDeclineCount(nextDecline);
    const nextSilenced = nextDecline >= MAX_SHOWINGS;
    if (nextSilenced) setSilenced(true);
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.lastShownAt, String(now)],
      [STORAGE_KEYS.declineCount, String(nextDecline)],
      ...(nextSilenced ? ([[STORAGE_KEYS.silenced, "true"]] as const) : []),
    ]);
  }, [declineCount]);

  const value = useMemo<NudgeContextValue>(
    () => ({
      showSettingsDot: pushEnabled === false && !notificationsInteracted,
      pendingSheet,
      recordArticleOpen,
      recordChautariOpen,
      markNotificationsInteracted,
      acceptNudge,
      declineNudge,
    }),
    [
      pushEnabled,
      notificationsInteracted,
      pendingSheet,
      recordArticleOpen,
      recordChautariOpen,
      markNotificationsInteracted,
      acceptNudge,
      declineNudge,
    ],
  );

  return <NudgeContext.Provider value={value}>{children}</NudgeContext.Provider>;
}

export function usePushNudge(): NudgeContextValue {
  const ctx = useContext(NudgeContext);
  if (!ctx) {
    throw new Error("usePushNudge must be used inside <PushNudgeProvider>");
  }
  return ctx;
}
