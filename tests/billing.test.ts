import { describe, expect, it } from "vitest";

import { pickBillingKey } from "@/lib/billing/keys";
import { shopPacks } from "@/features/wallet/packs";

const keys = { test: "test_abc", ios: "appl_abc", android: "goog_abc" };

describe("pickBillingKey", () => {
  it("uses the Test Store key in development", () => {
    expect(pickBillingKey({ os: "android", isDev: true, keys })).toBe("test_abc");
    expect(pickBillingKey({ os: "ios", isDev: true, keys })).toBe("test_abc");
  });

  it("never uses the Test Store key in a release build", () => {
    expect(pickBillingKey({ os: "ios", isDev: false, keys })).toBe("appl_abc");
    expect(pickBillingKey({ os: "android", isDev: false, keys })).toBe("goog_abc");
    expect(pickBillingKey({ os: "ios", isDev: false, keys: { test: "test_abc" } })).toBeNull();
  });

  it("refuses a Test Store key put in a platform slot by mistake", () => {
    expect(pickBillingKey({ os: "ios", isDev: false, keys: { ios: "test_oops" } })).toBeNull();
  });

  it("uses the platform key in development when there is no test key", () => {
    expect(pickBillingKey({ os: "android", isDev: true, keys: { android: "goog_abc" } })).toBe("goog_abc");
  });

  it("has nothing for web or missing keys", () => {
    expect(pickBillingKey({ os: "web", isDev: false, keys })).toBeNull();
    expect(pickBillingKey({ os: "ios", isDev: false, keys: { ios: "  " } })).toBeNull();
  });
});

describe("shopPacks", () => {
  it("shows only packs both the store and the server know, smallest first", () => {
    const store = [
      { productId: "coins_1000", price: "$9.99" },
      { productId: "coins_100", price: "$0.99" },
      { productId: "coins_secret", price: "$1.99" },
    ];
    const server = [
      { productId: "coins_100", coins: 100 },
      { productId: "coins_1000", coins: 1000 },
      { productId: "coins_500", coins: 500 },
    ];
    expect(shopPacks(store, server)).toEqual([
      { productId: "coins_100", coins: 100, price: "$0.99" },
      { productId: "coins_1000", coins: 1000, price: "$9.99" },
    ]);
  });
});
