import * as SecureStore from "expo-secure-store";

/**
 * Where Clerk keeps the session on this device.
 *
 * SecureStore, not AsyncStorage: this is the credential that proves who the
 * reader is to every Chautari endpoint. AsyncStorage is a plaintext file in
 * the app's sandbox, readable on a rooted or jailbroken handset and in a
 * filesystem backup; SecureStore is the Keychain on iOS and EncryptedSharedPreferences
 * on Android.
 *
 * This mirrors the rule already followed in `src/lib/storage/` — push tokens
 * are in SecureStore, reading preferences are in AsyncStorage — and a session
 * token is squarely on the sensitive side of that line.
 */

export const clerkTokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      /*
       * A failed read must look like "not signed in", not crash the app.
       * SecureStore throws on a device whose keychain is unavailable — for
       * instance before first unlock after a reboot.
       */
      return null;
    }
  },

  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Nothing useful to do: Clerk keeps the session in memory for this
      // launch, and the reader signs in again next time.
    }
  },

  async clearToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Already gone, or unreadable. Either way there is nothing to clear.
    }
  },
};
