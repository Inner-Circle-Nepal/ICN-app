import { useAuth } from "@clerk/clerk-expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ErrorMessage } from "@/components/ErrorMessage";
import { useToast } from "@/components/Toast";
import type { ShopPack } from "@/features/wallet/packs";
import {
  syncRecentPurchases,
  useBuyCoins,
  useCoinShop,
  useWallet,
  walletKey,
} from "@/features/wallet/useWallet";
import { useTheme } from "@/hooks/useTheme";
import { billing } from "@/lib/billing";
import { fontFamilies } from "@/theme/tokens";
import { CoinBalance, CoinPile } from "./Coin";

/**
 * The coin packs, shown inside the gift sheet (a second modal over the
 * first misbehaves). Prices are the store's own strings; how many coins a
 * pack gives comes from our server. A purchase is credited by the server
 * (useBuyCoins), and opening the shop first credits anything bought earlier
 * but never confirmed.
 */
export function CoinShop({ onDone }: { onDone: () => void }) {
  const { palette } = useTheme();
  const toast = useToast();
  const { userId, getToken } = useAuth();
  const qc = useQueryClient();
  const wallet = useWallet();
  const shop = useCoinShop(wallet.data?.packs);
  const buy = useBuyCoins();
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // At most once per opening (gcTime 0 forgets it when the shop closes), and
  // only reaching the server when syncPolicy says so. An effect re-ran on
  // every render here: Clerk's getToken isn't a stable reference.
  useQuery({
    queryKey: ["syncPurchases", userId],
    queryFn: async () => {
      const balance = await syncRecentPurchases(getToken, userId!);
      if (balance !== null) await qc.invalidateQueries({ queryKey: walletKey(userId) });
      return balance ?? 0;
    },
    enabled: billing.available && !!userId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

  const purchase = async (pack: ShopPack) => {
    if (buyingId) return;
    setError(null);
    setBuyingId(pack.productId);
    try {
      const result = await buy.mutateAsync(pack.productId);
      switch (result.status) {
        case "credited":
          toast.show({ icon: "check", message: `${pack.coins} coins added.` });
          onDone();
          break;
        case "on_the_way":
          toast.show({ icon: "info", message: "Payment received. Your coins will arrive shortly." });
          onDone();
          break;
        case "pending":
          toast.show({ icon: "info", message: "Your purchase is waiting for approval." });
          break;
        case "failed":
          setError(result.message);
          break;
        case "cancelled":
          break;
      }
    } catch {
      setError("The purchase couldn't be completed. Try again.");
    } finally {
      setBuyingId(null);
    }
  };

  if (!billing.available) {
    return (
      <Text style={[styles.note, { color: palette.quiet }]}>
        {"Buying coins isn't available in this version of the app."}
      </Text>
    );
  }

  return (
    <>
      <View style={styles.balance}>
        <CoinBalance coins={wallet.data?.coins ?? 0} testCoins={wallet.data?.testCoins ?? 0} />
      </View>

      {shop.isLoading || wallet.isLoading ? (
        <ActivityIndicator style={styles.loading} color={palette.ink} />
      ) : shop.isError || wallet.isError ? (
        <ErrorMessage
          style={styles.block}
          message="Couldn't load the coin packs."
          action={{
            label: "Try again",
            onPress: () => void (wallet.isError ? wallet.refetch() : shop.refetch()),
          }}
        />
      ) : !shop.data || shop.data.length === 0 ? (
        <Text style={[styles.note, { color: palette.quiet }]}>
          No coin packs are on sale right now.
        </Text>
      ) : (
        <View style={[styles.list, { borderTopColor: palette.rule }]}>
          {shop.data.map((pack, index) => {
            const busy = buyingId === pack.productId;
            return (
              <Pressable
                key={pack.productId}
                onPress={() => void purchase(pack)}
                disabled={Boolean(buyingId)}
                accessibilityRole="button"
                accessibilityLabel={`Buy ${pack.coins} coins for ${pack.price}`}
                accessibilityState={{ disabled: Boolean(buyingId), busy }}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: palette.rule },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.pack}>
                  <CoinPile level={index} />
                  <Text style={[styles.coins, { color: palette.ink }]}>
                    {pack.coins.toLocaleString()} coins
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator size="small" color={palette.ink} />
                ) : (
                  <Text style={[styles.price, { color: palette.ink, borderColor: palette.ink }]}>
                    {pack.price}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {error ? (
        <ErrorMessage compact style={styles.block} message={error} onDismiss={() => setError(null)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: 24 },
  block: { marginTop: 14 },
  note: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
    marginBottom: 8,
  },
  balance: { marginTop: 12 },
  pack: { flexDirection: "row", alignItems: "center", gap: 14 },
  list: { borderTopWidth: 1, marginTop: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  coins: { fontFamily: fontFamilies.serifMedium, fontSize: 16 },
  price: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pressed: { opacity: 0.7 },
});
