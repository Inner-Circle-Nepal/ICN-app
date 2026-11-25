/**
 * Buying coins, in our own words.
 *
 * Screens and hooks use `BillingProvider` only. Today it is backed by
 * RevenueCat (revenueCat.ts); a move to our own Apple/Google integration
 * (expo-iap) would be a second implementation of this interface plus a
 * server adapter, with no screen changes. Coin balances are never here: the
 * server's ledger owns them. A purchase only yields a store transaction id,
 * which the app hands to the server to verify and credit.
 */

export interface CoinPack {
  /** Store product id, e.g. `coins_500`; the server says how many coins it gives. */
  productId: string;
  /** The store's own localized price, e.g. "$4.99" or "NPR 670". Never computed here. */
  price: string;
}

export type BuyOutcome =
  | { status: "purchased"; transactionId: string }
  | { status: "cancelled" }
  /** Approved later (Ask to Buy, slow payment methods); the webhook credits it. */
  | { status: "pending" }
  | { status: "failed"; message: string };

export interface BillingProvider {
  /** False when this build or platform can't buy (no key, no native module, web). */
  readonly available: boolean;
  /** Tie purchases to the reader. Must run before buying. */
  identify(clerkUserId: string): Promise<void>;
  /** Forget the reader, on sign-out. */
  reset(): Promise<void>;
  /** The coin packs the store offers, with the store's prices. */
  coinPacks(): Promise<CoinPack[]>;
  buy(productId: string): Promise<BuyOutcome>;
}

/** The offering the coin shop shows, fetched by id rather than "current". */
export const COIN_OFFERING_ID = "default";
