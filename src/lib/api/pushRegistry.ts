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
