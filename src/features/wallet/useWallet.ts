import { useAuth } from "@clerk/clerk-expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";

import { ChautariError, sendGift } from "@/lib/api/chautari";
import { confirmPurchases, getEarnings, getWallet, syncPurchases, type Wallet } from "@/lib/api/readerProfile";
import { billing } from "@/lib/billing";
import { getPurchaseSync, updatePurchaseSync } from "@/lib/storage/purchaseSync";

import { shopPacks, type ShopPack } from "./packs";
import { shouldSync } from "./syncPolicy";

/**
 * Coins, from the reader's side.
 *
 * Balances always come from the server (`/api/reader/wallet`); the app never
 * adds or subtracts on its own beyond showing the balance the server just
 * returned. Must be used inside a ClerkProvider.
 */

export const walletKey = (userId: string | null | undefined) => ["wallet", userId ?? "none"] as const;

export function useWallet() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  return useQuery({
    queryKey: walletKey(userId),
    queryFn: () => getWallet(getToken),
    enabled: isLoaded && !!isSignedIn,
    staleTime: 30 * 1000,
  });
}

/** The reader's earnings as a host (points per room, top supporters). */
export function useEarnings() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  return useQuery({
    queryKey: ["earnings", userId ?? "none"],
    queryFn: () => getEarnings(getToken),
    enabled: isLoaded && !!isSignedIn,
    staleTime: 60 * 1000,
  });
}

/** Put a balance the server just returned into the cached wallet. */
function useSetBalance() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return (coins: number) =>
    qc.setQueryData<Wallet>(walletKey(userId), (w) => (w ? { ...w, coins } : w));
}

/** Coin packs to show: the store's prices for the packs our server knows. */
export function useCoinShop(serverPacks: Wallet["packs"] | undefined) {
  return useQuery({
    queryKey: ["coinShop", serverPacks?.map((p) => p.productId).join(",") ?? ""],
    queryFn: async (): Promise<ShopPack[]> => shopPacks(await billing.coinPacks(), serverPacks ?? []),
    enabled: billing.available && !!serverPacks,
    staleTime: 10 * 60 * 1000,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type BuyResult =
  | { status: "credited"; balance: number }
  /** Paid, but our server hasn't confirmed yet; the webhook will credit it. */
  | { status: "on_the_way" }
  | { status: "cancelled" }
  | { status: "pending" }
  | { status: "failed"; message: string };

/**
 * Buy a coin pack, then have the server credit it. The store's answer is
 * never trusted for the coins: the server verifies the transaction and
 * returns the new balance. If confirming fails a few times the purchase is
 * not lost; RevenueCat's webhook credits it.
 */
export function useBuyCoins() {
  const { userId, getToken } = useAuth();
  const qc = useQueryClient();
  const setBalance = useSetBalance();

  return useMutation({
    mutationFn: async (productId: string): Promise<BuyResult> => {
      if (!userId) return { status: "failed", message: "Sign in to buy coins." };
      // Make sure the purchase is recorded under this reader, not anonymously.
      await billing.identify(userId);
      // Set before paying, so a purchase is caught up on even if the app is
      // closed before it hears back from the store; cleared once credited.
      await updatePurchaseSync(userId, { unconfirmed: true });
      const outcome = await billing.buy(productId);
      if (outcome.status === "cancelled") await updatePurchaseSync(userId, { unconfirmed: false });
      if (outcome.status !== "purchased") return outcome;

      for (const wait of [0, 1500, 4000]) {
        if (wait) await sleep(wait);
        try {
          const res = await confirmPurchases(getToken, [outcome.transactionId]);
          const status = res.results[0]?.status;
          if (status === "credited" || status === "already_credited") {
            setBalance(res.balance);
            await updatePurchaseSync(userId, { unconfirmed: false });
            return { status: "credited", balance: res.balance };
          }
        } catch {
          // Try again; the webhook is the backstop.
        }
      }
      return { status: "on_the_way" };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: walletKey(userId) }),
  });
}

/**
 * Credit anything bought but never confirmed (the app was closed mid-purchase,
 * or offline). Called when the shop opens, but only reaches the server when
 * syncPolicy says so; the server then looks up this reader's purchases
 * itself and credits each one once. Returns the new balance if anything was
 * credited.
 */
export async function syncRecentPurchases(
  getToken: () => Promise<string | null>,
  userId: string,
): Promise<number | null> {
  if (!billing.available) return null;
  if (!shouldSync(await getPurchaseSync(userId), Date.now())) return null;
  try {
    const res = await syncPurchases(getToken);
    await updatePurchaseSync(userId, { unconfirmed: false, lastSyncAt: Date.now() });
    return res.results.some((r) => r.status === "credited") ? res.balance : null;
  } catch {
    return null;
  }
}

/**
 * Send the host a gift. Each call to `send` makes a new request id; the
 * mutation's single retry (network failures only) reuses it, so the retry
 * can never spend twice.
 */
export function useSendGift(roomSlug: string) {
  const { getToken, userId } = useAuth();
  const qc = useQueryClient();
  const setBalance = useSetBalance();

  const mutation = useMutation({
    mutationFn: (vars: { giftId: string; requestId: string }) =>
      sendGift(getToken, { roomSlug, ...vars }),
    retry: (count, error) =>
      count < 1 && error instanceof ChautariError && (error.reason === "offline" || error.reason === "timeout"),
    onSuccess: (res) => setBalance(res.balance),
    onError: (error) => {
      if (error instanceof ChautariError && error.reason === "insufficient_coins") {
        void qc.invalidateQueries({ queryKey: walletKey(userId) });
      }
    },
  });

  return {
    ...mutation,
    send: (giftId: string) => mutation.mutateAsync({ giftId, requestId: randomUUID() }),
  };
}
