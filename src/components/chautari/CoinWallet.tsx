import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ErrorMessage } from "@/components/ErrorMessage";
import { useWallet } from "@/features/wallet/useWallet";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { BottomSheet } from "./BottomSheet";
import { CoinBalance } from "./Coin";
import { CoinShop } from "./CoinShop";

/**
 * The reader's coins outside a room (profile): the balance and a way to buy
 * more, in the same shop the gift sheet uses. Signed-in only.
 */
export function CoinWallet() {
  const { palette } = useTheme();
  const wallet = useWallet();
  const [shopOpen, setShopOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      {wallet.isLoading ? (
        <ActivityIndicator style={styles.loading} color={palette.ink} />
      ) : wallet.isError || !wallet.data ? (
        <ErrorMessage
          compact
          message="Couldn't load your coins."
          action={{ label: "Try again", onPress: () => void wallet.refetch() }}
        />
      ) : (
        <View style={styles.row}>
          <CoinBalance coins={wallet.data.coins} testCoins={wallet.data.testCoins} />
          <Pressable
            onPress={() => setShopOpen(true)}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={[styles.link, { color: palette.ink }]}>Get coins</Text>
          </Pressable>
        </View>
      )}

      <BottomSheet visible={shopOpen} onClose={() => setShopOpen(false)}>
        <Text style={[styles.kicker, { color: palette.quiet }]}>For gifts in Chautari rooms</Text>
        <Text style={[styles.title, { color: palette.ink }]}>Get coins</Text>
        <CoinShop onDone={() => setShopOpen(false)} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  loading: { alignSelf: "flex-start", marginVertical: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pressed: { opacity: 0.6 },
  link: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: { fontFamily: fontFamilies.serifLight, fontSize: 24, lineHeight: 29, marginTop: 6 },
});
