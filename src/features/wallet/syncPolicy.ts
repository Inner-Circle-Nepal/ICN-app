/**
 * When opening the coin shop should ask the server to catch up on purchases.
 *
 * Normally never: a purchase is credited by the confirm right after it, and
 * in production RevenueCat's webhook covers the rest. So the shop syncs only
 * when this phone saw a purchase it couldn't confirm (the marker), plus at
 * most once a day as a safety net for what the marker can't see: a
 * reinstall, or a purchase made on another phone. Pure, for tests.
 */

export interface PurchaseSyncState {
  /** A purchase started here and wasn't confirmed as credited. */
  unconfirmed: boolean;
  /** When this phone last synced successfully (ms), or null if never. */
  lastSyncAt: number | null;
}

export const SAFETY_SYNC_MS = 24 * 60 * 60 * 1000;

export const EMPTY_SYNC_STATE: PurchaseSyncState = { unconfirmed: false, lastSyncAt: null };

export function shouldSync(state: PurchaseSyncState, now: number): boolean {
  if (state.unconfirmed || state.lastSyncAt === null) return true;
  // A clock set backwards counts as due rather than never.
  return now - state.lastSyncAt >= SAFETY_SYNC_MS || now < state.lastSyncAt;
}

export function parseSyncState(raw: string | null): PurchaseSyncState {
  if (!raw) return EMPTY_SYNC_STATE;
  try {
    const v = JSON.parse(raw) as Partial<PurchaseSyncState> | null;
    return {
      unconfirmed: v?.unconfirmed === true,
      lastSyncAt: typeof v?.lastSyncAt === "number" && Number.isFinite(v.lastSyncAt) ? v.lastSyncAt : null,
    };
  } catch {
    return EMPTY_SYNC_STATE;
  }
}
