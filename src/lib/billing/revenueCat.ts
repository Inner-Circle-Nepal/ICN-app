import { Platform } from "react-native";

import type { PurchasesPackage } from "react-native-purchases";

import { pickBillingKey } from "./keys";
import { purchasesModule } from "./module";
import { COIN_OFFERING_ID, type BillingProvider, type BuyOutcome, type CoinPack } from "./provider";

/**
 * `BillingProvider` backed by RevenueCat. The only file that imports
 * `react-native-purchases` (through module.ts).
 *
 * RevenueCat finishes and consumes store transactions itself once it has
 * checked them, so a coin pack can be bought again.
 */

const key = pickBillingKey({
  os: Platform.OS,
  isDev: __DEV__,
  keys: {
    test: process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY,
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  },
});

let configured = false;
/** Packages from the last `coinPacks()`, so `buy` can find one by product id. */
const packages = new Map<string, PurchasesPackage>();

function sdk() {
  const mod = purchasesModule();
  if (!mod || !key) return null;
  const Purchases = mod.default;
  if (!configured) {
    Purchases.configure({ apiKey: key });
    configured = true;
  }
  return { Purchases, mod };
}

export const revenueCatBilling: BillingProvider = {
  available: Boolean(key) && purchasesModule() !== null,

  async identify(clerkUserId) {
    const s = sdk();
    if (!s) return;
    await s.Purchases.logIn(clerkUserId);
  },

  async reset() {
    const s = sdk();
    if (!s) return;
    try {
      await s.Purchases.logOut();
    } catch {
      // Already anonymous: nothing to forget.
    }
  },

  async coinPacks(): Promise<CoinPack[]> {
    const s = sdk();
    if (!s) return [];
    const offerings = await s.Purchases.getOfferings();
    const offering = offerings.all[COIN_OFFERING_ID] ?? offerings.current;
    packages.clear();
    return (offering?.availablePackages ?? []).map((pkg) => {
      packages.set(pkg.product.identifier, pkg);
      return { productId: pkg.product.identifier, price: pkg.product.priceString };
    });
  },

  async buy(productId): Promise<BuyOutcome> {
    const s = sdk();
    if (!s) return { status: "failed", message: "Purchases aren't available on this device." };
    if (!packages.has(productId)) await this.coinPacks();
    const pkg = packages.get(productId);
    if (!pkg) return { status: "failed", message: "That coin pack isn't available." };

    try {
      const result = await s.Purchases.purchasePackage(pkg);
      return { status: "purchased", transactionId: result.transaction.transactionIdentifier };
    } catch (e) {
      const code = (e as { code?: string }).code;
      const { PURCHASES_ERROR_CODE } = s.mod;
      if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return { status: "cancelled" };
      if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { status: "pending" };
      return { status: "failed", message: "The purchase didn't go through." };
    }
  },
};
