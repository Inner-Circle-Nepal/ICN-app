/**
 * Which RevenueCat key this build may use.
 *
 * Development builds use the Test Store key (`EXPO_PUBLIC_REVENUECAT_TEST_KEY`,
 * from local-backend.env) when it is set: no Apple or Google account needed.
 * Every other build uses the platform key of the production RevenueCat
 * project. A Test Store key is refused outside development: shipped to a
 * store, it would let anyone "buy" coins for free (RevenueCat's SDK also
 * crashes on purpose in that case; this check keeps us from getting there).
 *
 * Pure, so it is tested without React Native.
 */

export interface BillingKeys {
  test?: string;
  ios?: string;
  android?: string;
}

export function pickBillingKey(args: {
  os: string;
  isDev: boolean;
  keys: BillingKeys;
}): string | null {
  const { os, isDev, keys } = args;
  const clean = (k: string | undefined) => (k && k.trim() ? k.trim() : null);

  const test = clean(keys.test);
  if (isDev && test) return test;

  const key = os === "ios" ? clean(keys.ios) : os === "android" ? clean(keys.android) : null;
  if (!key) return null;
  if (!isDev && key.startsWith("test_")) return null;
  return key;
}
