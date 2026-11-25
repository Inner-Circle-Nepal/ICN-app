import { NativeModules, Platform } from "react-native";

/**
 * Guarded access to `react-native-purchases`.
 *
 * Native code: a development build made before it was added, Expo Go, and
 * web have no RevenueCat module. The native side (`RNPurchases`) is checked
 * before the JS is loaded, because in development Metro reports a module
 * that fails to load as a fatal error even inside try/catch. Without it,
 * billing reports itself unavailable.
 */

export type PurchasesModule = typeof import("react-native-purchases");

/** `undefined` = not tried yet, `null` = tried and unavailable. */
let cached: PurchasesModule | null | undefined;

export function purchasesModule(): PurchasesModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === "web" || !NativeModules.RNPurchases) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("react-native-purchases") as PurchasesModule;
  } catch {
    cached = null;
  }
  return cached;
}
