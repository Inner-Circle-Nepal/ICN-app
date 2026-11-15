import { Platform } from "react-native";
import { getPublicSupabase } from "./supabase";
import { getStoredEdition, getStoredLanguage } from "@/lib/storage/preferences";

/**
 * Tell the newsroom which phones want breaking-news alerts.
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

export async function registerPushToken(token: string): Promise<boolean> {
  const sb = getPublicSupabase();
  if (!sb || (Platform.OS !== "ios" && Platform.OS !== "android")) return false;
  try {
    const [language, edition] = await Promise.all([getStoredLanguage(), getStoredEdition()]);
    const { error } = await sb.rpc("register_push_token", {
      p_token: token,
      p_platform: Platform.OS,
      p_language: language,
      p_edition: edition,
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

/**
 * Flip the Chautari-live opt-in for a token already in `mobile_push_tokens`.
 *
 * Does not create the row — the phone must already be registered via
 * `registerPushToken` (i.e. the breaking-news toggle is on). If no row
 * exists, the update affects zero rows and the function is a quiet no-op,
 * which is intentional: the Settings UI prevents enabling Chautari when
 * push is off, so hitting this path would be a client-side bug and not
 * something the server should fail loudly over.
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

/**
 * Flip the reminder opt-in. Same shape as `setChautariPushPreference`:
 * a no-op update when the row is missing, because the Settings UI
 * requires push to be on before the reminder switch is reachable.
 */
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
