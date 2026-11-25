import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ErrorMessage } from "@/components/ErrorMessage";
import { useToast } from "@/components/Toast";
import { giftArt } from "@/features/chautari/gifts";
import { useSendGift, useWallet } from "@/features/wallet/useWallet";
import { useTheme } from "@/hooks/useTheme";
import { ChautariError } from "@/lib/api/chautari";
import type { GiftInfo } from "@/lib/api/readerProfile";
import { fontFamilies } from "@/theme/tokens";
import { BottomSheet } from "./BottomSheet";
import { CoinBalance } from "./Coin";
import { CoinShop } from "./CoinShop";

/**
 * Send the host a gift: the catalogue, each gift's price in coins, and the
 * reader's balance. Tapping a gift sends it and closes the sheet, so the
 * sender sees their gift arrive in the room like everyone else (GiftBurst).
 * If the room couldn't be told, the gift still stands and a toast confirms
 * it instead. Everything shown comes from the server (wallet route); the
 * balance after a gift is the one the server returns. "Get coins" swaps the
 * list for the coin shop in the same sheet.
 */

export function GiftSheet({
  visible,
  onClose,
  roomSlug,
  hostName,
}: {
  visible: boolean;
  onClose: () => void;
  roomSlug: string;
  hostName: string | null;
}) {
  const { palette } = useTheme();
  const toast = useToast();
  const wallet = useWallet();
  const gift = useSendGift(roomSlug);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shopping, setShopping] = useState(false);

  const coins = wallet.data?.coins ?? 0;
  const testCoins = wallet.data?.testCoins ?? 0;

  const close = () => {
    setError(null);
    setShopping(false);
    onClose();
  };

  const send = async (item: GiftInfo) => {
    if (sendingId) return;
    setError(null);
    setSendingId(item.id);
    try {
      const sent = await gift.send(item.id);
      if (sent.delivered) {
        close();
      } else {
        toast.show({
          icon: "check",
          message: hostName ? `You sent ${hostName} a ${item.name}.` : `You sent a ${item.name}.`,
        });
      }
    } catch (e) {
      setError(
        e instanceof ChautariError && e.reason === "insufficient_coins"
          ? "You don't have enough coins for that gift."
          : e instanceof ChautariError
            ? e.message
            : "The gift couldn't be sent. Try again.",
      );
    } finally {
      setSendingId(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={close}>
      <Text style={[styles.kicker, { color: palette.quiet }]}>
        {hostName ? `Gifts for ${hostName}` : "Gifts for the host"}
      </Text>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: palette.ink }]}>
          {shopping ? "Get coins" : "Send a gift"}
        </Text>
        {shopping ? (
          <Pressable
            onPress={() => setShopping(false)}
            accessibilityRole="button"
            hitSlop={10}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={[styles.link, { color: palette.ink }]}>← Gifts</Text>
          </Pressable>
        ) : null}
      </View>

      {shopping ? (
        <CoinShop onDone={() => setShopping(false)} />
      ) : wallet.isLoading ? (
        <ActivityIndicator style={styles.loading} color={palette.ink} />
      ) : wallet.isError || !wallet.data ? (
        <ErrorMessage
          style={styles.block}
          message="Couldn't load your coins."
          action={{ label: "Try again", onPress: () => void wallet.refetch() }}
        />
      ) : (
        <>
          <View style={styles.balanceRow}>
            <CoinBalance coins={coins} testCoins={testCoins} />
            <Pressable
              onPress={() => {
                setError(null);
                setShopping(true);
              }}
              accessibilityRole="button"
              hitSlop={10}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={[styles.link, { color: palette.ink }]}>Get coins</Text>
            </Pressable>
          </View>

          <View style={[styles.list, { borderTopColor: palette.rule }]}>
            {wallet.data.gifts.map((item) => {
              const affordable = coins >= item.coins;
              const busy = sendingId === item.id;
              const disabled = Boolean(sendingId) || !affordable;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => void send(item)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Send a ${item.name} for ${item.coins} coins`}
                  accessibilityState={{ disabled, busy }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: palette.rule, opacity: affordable ? 1 : 0.45 },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.art} accessible={false}>
                    {giftArt(item.id)}
                  </Text>
                  <View style={styles.what}>
                    <Text style={[styles.name, { color: palette.ink }]}>{item.name}</Text>
                    {item.nameNe ? (
                      <Text style={[styles.nameNe, { color: palette.quiet }]}>{item.nameNe}</Text>
                    ) : null}
                  </View>
                  {busy ? (
                    <ActivityIndicator size="small" color={palette.ink} />
                  ) : (
                    <Text style={[styles.price, { color: palette.ink }]}>{item.coins} coins</Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <ErrorMessage
              compact
              style={styles.block}
              message={error}
              onDismiss={() => setError(null)}
            />
          ) : null}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: { fontFamily: fontFamilies.serifLight, fontSize: 24, lineHeight: 29, marginTop: 6 },
  loading: { marginVertical: 24 },
  block: { marginTop: 14 },
  heading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  link: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  list: { borderTopWidth: 1, marginTop: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  art: { fontSize: 26, lineHeight: 32 },
  what: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamilies.serifMedium, fontSize: 16 },
  nameNe: { fontFamily: fontFamilies.sansRegular, fontSize: 12.5, marginTop: 1 },
  price: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pressed: { opacity: 0.7 },
});
