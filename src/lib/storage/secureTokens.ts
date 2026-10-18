import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Encrypted storage for sensitive device tokens using Expo SecureStore.
 *
 * Falls back to no-op on web where native Keychain / Keystore is unavailable.
 */

const PUSH_TOKEN_KEY = "icn_device_push_token";

export async function getSecurePushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    return await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setSecurePushToken(token: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  } catch {
    // Ignore storage error
  }
}

export async function clearSecurePushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch {
    // Ignore storage error
  }
}
