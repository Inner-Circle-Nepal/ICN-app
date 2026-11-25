import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import type { DiscoverRoom } from "@/lib/api/chautari";
import { bookingStamp, formatStartsIn } from "@/features/chautari/schedule";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { Avatar } from "./Avatar";
import { LockIcon } from "./RoomIcons";

/**
 * The Chautari lobby's two kinds of card: rooms on air now, and rooms on
 * the schedule. Both lead with the room's cover photo when it has one; a
 * room without one gets an ink panel so the grid still reads as covers.
 */

/* --------------------------------------------------------------------- Live */

export function LiveRoomCard({ room, onPress }: { room: DiscoverRoom; onPress: () => void }) {
  const { palette } = useTheme();
  const onAir = useOnAir(room.startedAt);
  const listening = room.listeners + room.speakers;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        room.title,
        "Live now",
        room.hostName ? `Hosted by ${room.hostName}` : null,
        `${room.listeners} listening, ${room.speakers} on stage`,
        room.isFull ? "Room is full" : null,
        room.inviteOnly ? "Invite only: ask to join, or come in if you're invited" : null,
      ]
        .filter(Boolean)
        .join(". ")}
      style={({ pressed }) => [
        styles.liveCard,
        { borderColor: palette.ink, backgroundColor: palette.paper },
        pressed && styles.pressed,
      ]}
    >
      {room.bannerUrl ? (
        <View>
          <Image source={{ uri: room.bannerUrl }} style={styles.cover} contentFit="cover" transition={150} />
          <LiveTag onAir={onAir} style={styles.tagOnCover} />
        </View>
      ) : (
        <View style={styles.liveTagRow}>
          <LiveTag onAir={onAir} />
        </View>
      )}

      <View style={styles.liveBody}>
        <Text style={[styles.liveTitle, { color: palette.ink }]} numberOfLines={3}>
          {room.title}
        </Text>
        {room.description ? (
          <Text style={[styles.liveDesc, { color: palette.ink2 }]} numberOfLines={2}>
            {room.description}
          </Text>
        ) : null}

        <View style={[styles.liveFoot, { borderTopColor: palette.rule }]}>
          <Avatar
            name={room.hostName ?? "Host"}
            size="sm"
            imageUrl={room.hostAvatarUrl ?? null}
          />
          <View style={styles.liveFootText}>
            <Text style={[styles.hostName, { color: palette.ink }]} numberOfLines={1}>
              {room.hostName ?? "Chautari host"}
            </Text>
            <Text style={[styles.counts, { color: palette.quiet }]} numberOfLines={1}>
              {listening} in the room · {room.speakers} on stage
            </Text>
          </View>
          {room.inviteOnly && !room.isFull ? (
            <View style={styles.lockedJoin}>
              <LockIcon color={palette.red} size={13} locked />
              <Text style={[styles.join, { color: palette.red }]}>Invite only →</Text>
            </View>
          ) : (
            <Text style={[styles.join, { color: room.isFull ? palette.quiet : palette.red }]}>
              {room.isFull ? "Full" : "Listen in →"}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function LiveTag({ onAir, style }: { onAir: string | null; style?: object }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.liveTag, { backgroundColor: palette.red }, style]}>
      <View style={styles.liveTagDot} />
      <Text style={styles.liveTagText}>Live{onAir ? ` · ${onAir}` : ""}</Text>
    </View>
  );
}

/** Time on air, refreshed every 30 s. A card is not a stopwatch. */
function useOnAir(startedAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!startedAt) return null;
  const mins = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} m`;
}

/* ----------------------------------------------------------------- Upcoming */

export function UpcomingRail({
  rooms,
  onPress,
}: {
  rooms: DiscoverRoom[];
  onPress: (room: DiscoverRoom) => void;
}) {
  const { palette } = useTheme();
  // One clock for the whole rail; "in 34 min" only needs the minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (rooms.length === 0) return null;

  return (
    <View style={styles.rail}>
      <View style={[styles.railHeader, { borderBottomColor: palette.ink }]}>
        <Text style={[styles.railTitle, { color: palette.ink }]}>Coming up</Text>
        <Text style={[styles.railCount, { color: palette.quiet }]}>
          {rooms.length} on the schedule
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 12}
        contentContainerStyle={styles.railRow}
      >
        {rooms.map((room) => (
          <UpcomingCard key={room.slug} room={room} now={now} onPress={() => onPress(room)} />
        ))}
      </ScrollView>
    </View>
  );
}

const CARD_WIDTH = 248;

function UpcomingCard({
  room,
  now,
  onPress,
}: {
  room: DiscoverRoom;
  now: number;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const stamp = room.scheduledFor ? bookingStamp(room.scheduledFor) : null;
  const startsIn = room.scheduledFor
    ? formatStartsIn(new Date(room.scheduledFor).getTime() - now)
    : "Scheduled";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${room.title}. ${stamp ? `${stamp.day} ${stamp.time} Kathmandu time, ${startsIn}` : "Scheduled"}.${room.hostName ? ` Hosted by ${room.hostName}.` : ""}`}
      style={({ pressed }) => [
        styles.upCard,
        { borderColor: palette.rule2, backgroundColor: palette.paper },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.upCover, { backgroundColor: palette.ink }]}>
        {room.bannerUrl ? (
          <Image source={{ uri: room.bannerUrl }} style={styles.fill} contentFit="cover" transition={150} />
        ) : null}
        {stamp ? (
          <View style={[styles.stamp, { backgroundColor: palette.paper }]}>
            <Text style={[styles.stampDay, { color: palette.red }]}>{stamp.day}</Text>
            <Text style={[styles.stampTime, { color: palette.ink }]}>{stamp.time}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.upBody}>
        <Text style={[styles.startsIn, { color: palette.red }]}>{startsIn}</Text>
        <Text style={[styles.upTitle, { color: palette.ink }]} numberOfLines={2}>
          {room.title}
        </Text>
        <View style={styles.upHost}>
          <Avatar name={room.hostName ?? "Host"} size="sm" imageUrl={room.hostAvatarUrl ?? null} />
          <Text style={[styles.upHostName, { color: palette.quiet }]} numberOfLines={1}>
            {room.hostName ?? "Chautari host"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lockedJoin: { flexDirection: "row", alignItems: "center", gap: 4 },
  pressed: { opacity: 0.85 },
  fill: { width: "100%", height: "100%" },

  liveCard: { borderWidth: 1, borderTopWidth: 3, marginTop: 16 },
  cover: { width: "100%", aspectRatio: 16 / 9 },
  tagOnCover: { position: "absolute", left: 12, top: 12 },
  liveTagRow: { paddingHorizontal: 14, paddingTop: 14 },
  liveTag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  liveTagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ffffff" },
  liveTagText: {
    color: "#ffffff",
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  liveBody: { padding: 14 },
  liveTitle: { fontFamily: fontFamilies.serifMedium, fontSize: 21, lineHeight: 26 },
  liveDesc: { fontFamily: fontFamilies.serifRegular, fontSize: 14.5, lineHeight: 21, marginTop: 6 },
  liveFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  liveFootText: { flex: 1, minWidth: 0 },
  hostName: { fontFamily: fontFamilies.serifMedium, fontSize: 14.5 },
  counts: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 1 },
  join: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },

  rail: { marginTop: 30 },
  railHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderBottomWidth: 1,
    paddingBottom: 6,
  },
  railTitle: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  railCount: { fontFamily: fontFamilies.sansRegular, fontSize: 11 },
  // Bleeds to the screen edge so cards scroll out from under the margin.
  railRow: {
    gap: 12,
    paddingTop: 14,
    paddingHorizontal: spacing.gutter,
    marginHorizontal: -spacing.gutter,
  },
  upCard: { width: CARD_WIDTH, borderWidth: 1 },
  upCover: { width: "100%", aspectRatio: 16 / 9, overflow: "hidden" },
  stamp: { position: "absolute", left: 10, bottom: 10, paddingHorizontal: 8, paddingVertical: 5 },
  stampDay: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  stampTime: { fontFamily: fontFamilies.serifMedium, fontSize: 15, marginTop: 1 },
  upBody: { padding: 12 },
  startsIn: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  upTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 16,
    lineHeight: 21,
    marginTop: 4,
    minHeight: 42,
  },
  upHost: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  upHostName: { flex: 1, fontFamily: fontFamilies.sansRegular, fontSize: 12 },
});
