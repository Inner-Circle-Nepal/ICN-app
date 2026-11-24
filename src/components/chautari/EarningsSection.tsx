import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ErrorMessage } from "@/components/ErrorMessage";
import { useEarnings } from "@/features/wallet/useWallet";
import { useTheme } from "@/hooks/useTheme";
import type { Earnings } from "@/lib/api/readerProfile";
import { fontFamilies } from "@/theme/tokens";
import { formatDate } from "@/utils/format";
import { Avatar } from "./Avatar";

/**
 * "Your earnings" on the Earn screen: the host's points, what each room
 * brought in, and who gave the most (seen only by the host). Points are not
 * money: there is no payout yet, and test points (from test coins) are never
 * paid, so they're shown apart and only when there are any. Signed-in only;
 * the screen mounts this inside its Clerk branch.
 */
export function EarningsSection() {
  const { palette } = useTheme();
  const earnings = useEarnings();

  return (
    <View style={styles.section}>
      <Text style={[styles.label, { color: palette.ink, borderBottomColor: palette.ink }]}>
        Your earnings
      </Text>

      {earnings.isLoading ? (
        <ActivityIndicator style={styles.loading} color={palette.ink} />
      ) : earnings.isError || !earnings.data ? (
        <ErrorMessage
          compact
          style={styles.block}
          message="Couldn't load your earnings."
          action={{ label: "Try again", onPress: () => void earnings.refetch() }}
        />
      ) : earnings.data.gifts === 0 && earnings.data.points === 0 && earnings.data.testPoints === 0 ? (
        <Text style={[styles.empty, { color: palette.quiet }]}>
          When listeners send you gifts in your rooms, your points show here.
        </Text>
      ) : (
        <Breakdown data={earnings.data} />
      )}
    </View>
  );
}

function Breakdown({ data }: { data: Earnings }) {
  const { palette } = useTheme();
  return (
    <>
      <View
        style={styles.totals}
        accessible
        accessibilityLabel={`${data.points} points${data.testPoints > 0 ? `, plus ${data.testPoints} test points that are not paid` : ""}`}
      >
        <Text style={[styles.figure, { color: palette.ink }]}>{data.points.toLocaleString()}</Text>
        <Text style={[styles.unit, { color: palette.ink }]}>points</Text>
      </View>
      {data.testPoints > 0 ? (
        <Text style={[styles.test, { color: palette.quiet }]}>
          + {data.testPoints.toLocaleString()} test points (not paid)
        </Text>
      ) : null}
      <Text style={[styles.note, { color: palette.quiet }]}>
        Each gift coin is one point. Points aren&apos;t money yet: payouts open with the programme.
      </Text>

      {data.rooms.length > 0 ? (
        <>
          <Text style={[styles.subhead, { color: palette.quiet, borderBottomColor: palette.rule }]}>
            By room
          </Text>
          {data.rooms.map((room) => (
            <View
              key={room.slug}
              style={[styles.row, { borderBottomColor: palette.rule }]}
              accessible
              accessibilityLabel={`${room.title}, ${formatDate(room.at, "Asia/Kathmandu")}. ${room.gifts} gifts from ${room.supporters} people. ${pointsLabel(room.points, room.testPoints)}`}
            >
              <View style={styles.what}>
                <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
                  {room.title}
                </Text>
                <Text style={[styles.detail, { color: palette.quiet }]} numberOfLines={1}>
                  {formatDate(room.at, "Asia/Kathmandu")} · {room.gifts}{" "}
                  {room.gifts === 1 ? "gift" : "gifts"} · {room.supporters}{" "}
                  {room.supporters === 1 ? "person" : "people"}
                </Text>
              </View>
              <Amount points={room.points} testPoints={room.testPoints} />
            </View>
          ))}
        </>
      ) : null}

      {data.supporters.length > 0 ? (
        <>
          <Text style={[styles.subhead, { color: palette.quiet, borderBottomColor: palette.rule }]}>
            Top supporters · only you see this
          </Text>
          {data.supporters.map((person, i) => (
            <View
              key={person.username ?? `supporter-${i}`}
              style={[styles.row, { borderBottomColor: palette.rule }]}
              accessible
              accessibilityLabel={`${person.name}. ${pointsLabel(person.points, person.testPoints)}`}
            >
              <Avatar name={person.name} size="sm" imageUrl={person.avatarUrl} />
              <View style={styles.what}>
                <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
                  {person.name}
                </Text>
                {person.username ? (
                  <Text style={[styles.detail, { color: palette.quiet }]} numberOfLines={1}>
                    @{person.username}
                  </Text>
                ) : null}
              </View>
              <Amount points={person.points} testPoints={person.testPoints} />
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

/** Real points in ink; test points underneath in grey, only when there are any. */
function Amount({ points, testPoints }: { points: number; testPoints: number }) {
  const { palette } = useTheme();
  return (
    <View style={styles.amount}>
      <Text style={[styles.points, { color: palette.ink }]}>{points.toLocaleString()} pts</Text>
      {testPoints > 0 ? (
        <Text style={[styles.testSmall, { color: palette.quiet }]}>
          +{testPoints.toLocaleString()} test
        </Text>
      ) : null}
    </View>
  );
}

function pointsLabel(points: number, testPoints: number): string {
  return `${points} points${testPoints > 0 ? `, ${testPoints} test points` : ""}`;
}

const styles = StyleSheet.create({
  section: { marginTop: 28 },
  label: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingBottom: 7,
    borderBottomWidth: 1,
  },
  loading: { marginVertical: 24 },
  block: { marginTop: 14 },
  empty: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },
  totals: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 16 },
  figure: { fontFamily: fontFamilies.serifLight, fontSize: 40, lineHeight: 46, letterSpacing: -0.8 },
  unit: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  test: { fontFamily: fontFamilies.sansRegular, fontSize: 13, marginTop: 2 },
  note: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 10,
  },
  subhead: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    marginTop: 24,
    paddingBottom: 7,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  what: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  detail: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 2 },
  amount: { alignItems: "flex-end" },
  points: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  testSmall: { fontFamily: fontFamilies.sansRegular, fontSize: 11, marginTop: 2 },
});
