import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { ErrorMessage } from "@/components/ErrorMessage";
import { giftArt } from "@/features/chautari/gifts";
import { useTheme } from "@/hooks/useTheme";
import type { GiftPerson, RoomSupporters } from "@/lib/api/chautari";
import { fontFamilies } from "@/theme/tokens";
import { timeAgo } from "@/utils/format";
import { Avatar } from "./Avatar";
import { BottomSheet } from "./BottomSheet";

/**
 * Who has sent gifts in this room.
 *
 * Everyone sees a thank-you list: names only, in the order people first
 * gave, never amounts or a ranking. The host also gets what they need to
 * thank people on air: "Latest" (every gift, newest first, with its time and
 * price) and "By person" (each supporter's total, largest first).
 */
export function SupportersSheet({
  visible,
  onClose,
  data,
  isLoading,
  isError,
  onRetry,
}: {
  visible: boolean;
  onClose: () => void;
  data: RoomSupporters | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const { palette } = useTheme();
  const [view, setView] = useState<"latest" | "people">("latest");
  const host = data?.host ?? null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.kicker, { color: palette.quiet }]}>
        {host ? "Gifts in this room" : `Supporters · ${data?.supporters.length ?? 0}`}
      </Text>
      <Text style={[styles.title, { color: palette.ink }]}>
        {host ? "Your supporters" : "Thank you"}
      </Text>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={palette.ink} />
      ) : isError || !data ? (
        <ErrorMessage
          style={styles.block}
          message="Couldn't load the supporters."
          action={{ label: "Try again", onPress: onRetry }}
        />
      ) : data.supporters.length === 0 ? (
        <Text style={[styles.empty, { color: palette.quiet }]}>
          No gifts yet. Everyone who sends one is thanked here.
        </Text>
      ) : host ? (
        <>
          <Text style={[styles.summary, { color: palette.ink }]}>
            {host.timeline.length} {host.timeline.length === 1 ? "gift" : "gifts"} from{" "}
            {data.supporters.length} {data.supporters.length === 1 ? "person" : "people"} ·{" "}
            {host.totalCoins} coins
          </Text>

          <View style={[styles.tabs, { borderColor: palette.rule2 }]} accessibilityRole="tablist">
            {(
              [
                ["latest", "Latest"],
                ["people", "By person"],
              ] as const
            ).map(([id, label]) => {
              const on = view === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setView(id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[styles.tab, on && { backgroundColor: palette.ink }]}
                >
                  <Text style={[styles.tabText, { color: on ? palette.paper : palette.ink }]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {view === "latest" ? (
            <FlatList
              data={host.timeline}
              keyExtractor={(g) => g.id}
              style={[styles.list, { borderTopColor: palette.rule }]}
              renderItem={({ item }) => (
                <Row
                  person={item}
                  detail={`${giftArt(item.giftId)} ${item.giftName} · ${timeAgo(item.sentAt)}`}
                  amount={item.coins}
                />
              )}
            />
          ) : (
            <FlatList
              data={host.totals}
              keyExtractor={(p, i) => p.username ?? `listener-${i}`}
              style={[styles.list, { borderTopColor: palette.rule }]}
              renderItem={({ item }) => <Row person={item} amount={item.coins} />}
            />
          )}
        </>
      ) : (
        <>
          <Text style={[styles.summary, { color: palette.quiet }]}>
            Everyone who sent a gift in this room.
          </Text>
          <FlatList
            data={data.supporters}
            keyExtractor={(p, i) => p.username ?? `listener-${i}`}
            style={[styles.list, { borderTopColor: palette.rule }]}
            renderItem={({ item }) => <Row person={item} />}
          />
        </>
      )}
    </BottomSheet>
  );
}

function Row({ person, detail, amount }: { person: GiftPerson; detail?: string; amount?: number }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: palette.rule }]}>
      <Avatar name={person.name} size="sm" imageUrl={person.avatarUrl} />
      <View style={styles.who}>
        <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
          {person.name}
        </Text>
        {detail || person.username ? (
          <Text style={[styles.detail, { color: palette.quiet }]} numberOfLines={1}>
            {detail ?? `@${person.username}`}
          </Text>
        ) : null}
      </View>
      {amount !== undefined ? (
        <Text style={[styles.amount, { color: palette.ink }]}>{amount} coins</Text>
      ) : null}
    </View>
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
  empty: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
    marginBottom: 8,
  },
  summary: { fontFamily: fontFamilies.sansRegular, fontSize: 13, marginTop: 10 },
  tabs: {
    flexDirection: "row",
    alignSelf: "flex-start",
    borderWidth: 1,
    marginTop: 14,
  },
  tab: { paddingHorizontal: 14, minHeight: 34, justifyContent: "center" },
  tabText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  list: { borderTopWidth: 1, marginTop: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  who: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  detail: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 1 },
  amount: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
});
