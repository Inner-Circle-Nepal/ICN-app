import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import type { RoomDetails, RoomPerson } from "@/lib/api/chautari";
import { formatBooking, formatCountdown } from "@/features/chautari/schedule";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Avatar } from "./Avatar";

/**
 * A booked room before it goes live: what it is, who is running it, and how
 * long until it starts. Its host and moderators also get Go live and Cancel;
 * everyone else waits, and the screen moves into the room by itself when
 * someone starts it.
 */
export function WaitingRoom({
  room,
  canStart,
  starting,
  onGoLive,
  onCancel,
  actionError,
  onDismissError,
  onInvite,
  onOpenProfile,
  insetsBottom,
}: {
  room: RoomDetails;
  canStart: boolean;
  starting: boolean;
  onGoLive: () => void;
  onCancel: () => void;
  /** Why going live or cancelling failed, shown above the buttons. */
  actionError: string | null;
  onDismissError: () => void;
  /** Host or moderator: invite people to this room. */
  onInvite: () => void;
  onOpenProfile: (username: string) => void;
  insetsBottom: number;
}) {
  const { palette } = useTheme();
  const startsAt = room.scheduledFor ? new Date(room.scheduledFor).getTime() : null;

  // Ticks every second; the countdown only shows seconds in the last hour.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const countdown = startsAt ? formatCountdown(startsAt - now) : "Starting soon";
  const people: (RoomPerson & { role: string })[] = [
    { ...room.host, role: "Host" },
    ...room.moderators.map((m) => ({ ...m, role: "Moderator" })),
  ];

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 32 }]}>
        {room.bannerUrl ? (
          <Image
            source={{ uri: room.bannerUrl }}
            style={styles.banner}
            contentFit="cover"
            transition={150}
          />
        ) : null}

        <View style={styles.text}>
          <Text style={[styles.kicker, { color: palette.red }]}>On the schedule</Text>
          <Text style={[styles.title, { color: palette.ink }]}>{room.title}</Text>
          {room.description ? (
            <Text style={[styles.description, { color: palette.ink2 }]}>{room.description}</Text>
          ) : null}

          <View style={[styles.countBox, { borderColor: palette.ink }]}>
            <Text style={[styles.countLabel, { color: palette.quiet }]}>
              {startsAt && startsAt > now ? "Starts in" : "Scheduled for"}
            </Text>
            <Text
              style={[styles.count, { color: palette.ink }]}
              accessibilityLiveRegion="polite"
            >
              {countdown}
            </Text>
            {room.scheduledFor ? (
              <Text style={[styles.when, { color: palette.quiet }]}>
                {formatBooking(room.scheduledFor)}
              </Text>
            ) : null}
          </View>

          <Text style={[styles.section, { color: palette.ink, borderBottomColor: palette.ink }]}>
            Running the room
          </Text>
          {people.map((p, i) => (
            <Pressable
              key={`${p.username ?? p.name}-${i}`}
              onPress={p.username ? () => onOpenProfile(p.username!) : undefined}
              disabled={!p.username}
              accessibilityRole={p.username ? "button" : undefined}
              accessibilityLabel={`${p.name}, ${p.role}${p.username ? ". View profile" : ""}`}
              style={({ pressed }) => [
                styles.person,
                { borderBottomColor: palette.rule },
                pressed && styles.pressed,
              ]}
            >
              <Avatar name={p.name} size="md" imageUrl={p.avatarUrl} />
              <View style={styles.personText}>
                <Text style={[styles.personName, { color: palette.ink }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[styles.personMeta, { color: palette.quiet }]} numberOfLines={1}>
                  {p.role}
                  {p.username ? ` · @${p.username}` : ""}
                </Text>
              </View>
            </Pressable>
          ))}

          {canStart ? (
            <Pressable
              onPress={onInvite}
              accessibilityRole="button"
              accessibilityLabel="Invite people to this room"
              style={({ pressed }) => [
                styles.invite,
                { borderColor: palette.ink },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.btnText, { color: palette.ink }]}>Invite people</Text>
            </Pressable>
          ) : null}

          {!canStart ? (
            <Text style={[styles.note, { color: palette.quiet }]}>
              The room opens when its host or a moderator starts it. Keep this page open and
              you will be taken in.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {canStart && actionError ? (
        <ErrorMessage
          compact
          style={styles.actionError}
          message={actionError}
          onDismiss={onDismissError}
        />
      ) : null}
      {canStart ? (
        <View
          style={[
            styles.bar,
            {
              backgroundColor: palette.paper,
              borderTopColor: palette.rule,
              paddingBottom: Math.max(12, insetsBottom),
            },
          ]}
        >
          <Pressable
            onPress={onCancel}
            disabled={starting}
            accessibilityRole="button"
            accessibilityLabel="Cancel this room"
            style={({ pressed }) => [
              styles.cancel,
              { borderColor: palette.rule2 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.btnText, { color: palette.quiet }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onGoLive}
            disabled={starting}
            accessibilityRole="button"
            accessibilityLabel="Go live now"
            style={({ pressed }) => [
              styles.goLive,
              { backgroundColor: palette.red },
              pressed && styles.pressed,
            ]}
          >
            {starting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <View style={styles.liveDot} />
                <Text style={[styles.btnText, { color: "#ffffff" }]}>Go live</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  invite: {
    marginTop: 18,
    borderWidth: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  body: {},
  banner: { width: "100%", aspectRatio: 16 / 9 },
  text: { paddingHorizontal: spacing.gutter, paddingTop: 20 },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.5,
    marginTop: 6,
  },
  description: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  countBox: {
    borderTopWidth: 2,
    borderBottomWidth: 1,
    paddingVertical: 16,
    marginTop: 22,
    alignItems: "center",
  },
  countLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  count: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 44,
    lineHeight: 52,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  when: { fontFamily: fontFamilies.sansRegular, fontSize: 12.5, marginTop: 2 },
  section: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginTop: 28,
  },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  personText: { flex: 1, minWidth: 0 },
  personName: { fontFamily: fontFamilies.serifMedium, fontSize: 16 },
  personMeta: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 2 },
  note: { fontFamily: fontFamilies.serifRegular, fontSize: 14.5, lineHeight: 21, marginTop: 20 },
  actionError: { marginHorizontal: spacing.gutter, marginBottom: 10 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  cancel: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderRadius: 24,
    justifyContent: "center",
  },
  goLive: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffffff" },
  btnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  pressed: { opacity: 0.75 },
});
