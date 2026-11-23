import { Platform } from "react-native";
import { getPublicSupabase } from "./supabase";
import { getStoredEdition, getStoredLanguage } from "@/lib/storage/preferences";

/**
 * Tell the newsroom which phones want which alerts.
 *
 * Writes go through two Supabase functions (`register_push_token`,
 * `unregister_push_token`, see supabase/migrations/20261030_mobile_push.sql)
 * rather than the table, so the anon key can add or remove only the token it
 * holds and can never read the list. The sender is the `send-breaking-push`
 * Edge Function.
 *
 * Both calls are best-effort and never throw: a reader who turned alerts on
 * while offline is registered again on the next launch by
 * `syncPushRegistration`.
 */

/**
 * `breaking` is this phone's breaking-news opt-in. A phone can be registered
 * only for Chautari alerts or reminders, so registering no longer implies it.
 */
export async function registerPushToken(token: string, breaking: boolean): Promise<boolean> {
  const sb = getPublicSupabase();
  if (!sb || (Platform.OS !== "ios" && Platform.OS !== "android")) return false;
  try {
    const [language, edition] = await Promise.all([getStoredLanguage(), getStoredEdition()]);
    const { error } = await sb.rpc("register_push_token", {
      p_token: token,
      p_platform: Platform.OS,
      p_language: language,
      p_edition: edition,
      p_breaking: breaking,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function unregisterPushToken(token: string): Promise<boolean> {
  const sb = getPublicSupabase();
  if (!sb) return false;
  try {
    const { error } = await sb.rpc("unregister_push_token", { p_token: token });
    return !error;
  } catch {
    return false;
  }
}

/** Flip the breaking-news opt-in for a token already registered. */
export async function setBreakingPushPreference(
  token: string,
  enabled: boolean,
): Promise<boolean> {
  const sb = getPublicSupabase();
  if (!sb || (Platform.OS !== "ios" && Platform.OS !== "android")) return false;
  try {
    const { error } = await sb.rpc("set_breaking_push_preference", {
      p_token: token,
      p_enabled: enabled,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Flip the All news opt-in (every new story). The sender treats it as
 * covering breaking news too, so such a phone gets one push per story.
 */
export async function setAllNewsPushPreference(
  token: string,
  enabled: boolean,
): Promise<boolean> {
  const sb = getPublicSupabase();
  if (!sb || (Platform.OS !== "ios" && Platform.OS !== "android")) return false;
  try {
    const { error } = await sb.rpc("set_all_news_push_preference", {
      p_token: token,
      p_enabled: enabled,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Flip the Chautari opt-in (alerts from the people you follow) for a token
 * already in `mobile_push_tokens`. A quiet no-op when the row is missing:
 * `push.ts` registers the phone before flipping any preference.
 */
export async function setChautariPushPreference(
  token: string,
  enabled: boolean,
): Promise<boolean> {
  const sb = getPublicSupabase();
  if (!sb || (Platform.OS !== "ios" && Platform.OS !== "android")) return false;
  try {
    const { error } = await sb.rpc("set_chautari_push_preference", {
      p_token: token,
      p_enabled: enabled,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Flip the reminder opt-in. Same shape as `setChautariPushPreference`. */
export async function setReminderPushPreference(
  token: string,
  enabled: boolean,
): Promise<boolean> {
  const sb = getPublicSupabase();
  if (!sb || (Platform.OS !== "ios" && Platform.OS !== "android")) return false;
  try {
    const { error } = await sb.rpc("set_reminder_push_preference", {
      p_token: token,
      p_enabled: enabled,
    });
    return !error;
  } catch {
    return false;
  }
}
