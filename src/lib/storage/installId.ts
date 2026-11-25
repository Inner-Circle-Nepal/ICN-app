import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";

/**
 * A random id for this installation of the app.
 *
 * Not a hardware or advertising id: it is made here, kept in SecureStore, and
 * gone when the app is uninstalled. Sent when joining a Chautari room so the
 * listening log can later tell one phone running many accounts from many
 * real listeners. Web has no SecureStore, so no id.
 */

const KEY = "icn_install_id";
let cached: Promise<string | null> | null = null;

export function getInstallId(): Promise<string | null> {
  if (Platform.OS === "web") return Promise.resolve(null);
  cached ??= (async () => {
    try {
      const existing = await SecureStore.getItemAsync(KEY);
      if (existing) return existing;
      const id = randomUUID();
      await SecureStore.setItemAsync(KEY, id);
      return id;
    } catch {
      return null;
    }
  })();
  return cached;
}
