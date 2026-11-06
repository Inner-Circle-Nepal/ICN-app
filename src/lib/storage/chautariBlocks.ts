import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Chautari participants this reader has blocked, by LiveKit identity.
 *
 * Kept on the device: blocking is the reader's own choice about what they
 * hear, so it needs no server round trip and works in every room. The
 * identity is the Clerk user id the token endpoint assigns, so a block
 * follows the person between rooms and survives a display-name change.
 */

const KEY = "icn-chautari-blocked-v1";

export async function getBlockedIdentities(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is string => typeof v === "string"));
    }
  } catch {
    // Ignore storage errors
  }
  return new Set();
}

export async function setBlockedIdentities(ids: ReadonlySet<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore storage errors
  }
}
