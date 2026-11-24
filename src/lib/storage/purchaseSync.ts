import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  EMPTY_SYNC_STATE,
  parseSyncState,
  type PurchaseSyncState,
} from "@/features/wallet/syncPolicy";

/**
 * Per reader, on this phone: whether a purchase is waiting to be confirmed,
 * and when the coin shop last caught up (see syncPolicy.ts). Not a secret
 * and not the balance: losing it only means one extra or one later sync.
 */

const key = (userId: string) => `icn-purchase-sync-v1:${userId}`;

export async function getPurchaseSync(userId: string): Promise<PurchaseSyncState> {
  try {
    return parseSyncState(await AsyncStorage.getItem(key(userId)));
  } catch {
    return EMPTY_SYNC_STATE;
  }
}

export async function updatePurchaseSync(
  userId: string,
  change: Partial<PurchaseSyncState>,
): Promise<void> {
  try {
    const next = { ...(await getPurchaseSync(userId)), ...change };
    await AsyncStorage.setItem(key(userId), JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
}
