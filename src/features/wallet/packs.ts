import type { CoinPack } from "@/lib/billing";
import type { CoinPackInfo } from "@/lib/api/readerProfile";

/**
 * A coin pack the shop can show: offered by the store (which sets the price)
 * AND known to our server (which decides the coins). A pack only one side
 * knows is left out: unpriced, or unpaid if bought.
 */
export interface ShopPack {
  productId: string;
  coins: number;
  price: string;
}

export function shopPacks(store: CoinPack[], server: CoinPackInfo[]): ShopPack[] {
  const coins = new Map(server.map((p) => [p.productId, p.coins]));
  return store
    .filter((p) => coins.has(p.productId))
    .map((p) => ({ productId: p.productId, coins: coins.get(p.productId)!, price: p.price }))
    .sort((a, b) => a.coins - b.coins);
}
