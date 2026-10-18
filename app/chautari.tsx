import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";

import { discoverRooms, type DiscoverRoom } from "@/lib/api/chautari";
import { isClerkConfigured } from "@/constants/config";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { timeAgo } from "@/utils/format";
import { AppHeader } from "@/components/AppHeader";
import { SectionRule } from "@/components/SectionRule";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";

/**
 * Chautari — the rooms that are on air.
 *
 * A chautari is the platform under a village tree where people stop to talk.
 * The screen is a schedule, not a feed: live first, then what is coming,
 * with the same hairlines and type scale as the front page.
 *
 * Browsing needs no account. Joining does — that gate is on the room screen
 * and on the server, not here, because requiring a sign-in to see what is
 * happening is how a feature stays undiscovered.
 */
export default function ChautariScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const rooms = useQuery({
    queryKey: ["chautari-rooms"],
    queryFn: discoverRooms,
    // A live schedule goes stale quickly; a minute is the most it should lag.
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const live = (rooms.data ?? []).filter((r) => r.status === "live");
  const upcoming = (rooms.data ?? []).filter((r) => r.status === "scheduled");

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <AppHeader showSectionBar={false} />

      <FlatList
        data={live}
        keyExtractor={(r) => r.slug}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={rooms.isRefetching}
            onRefresh={() => void rooms.refetch()}
            tintColor={palette.ink}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={[styles.hero, { borderBottomColor: palette.ink }]}>
              <Text style={[styles.kicker, { color: palette.quiet }]}>
                Live conversation
              </Text>
              <Text style={[styles.title, { color: palette.ink }]}>Chautari</Text>
              <Text style={[styles.subtitle, { color: palette.quiet }]}>
                The platform under the tree, where the newsroom and its readers
                talk out loud. Listen in, or raise a hand to speak.
              </Text>
            </View>

            <HostBar />

            {live.length > 0 ? (
              <View style={styles.sectionGap}>
                <SectionRule title="On air now" cta={`${live.length} live`} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <RoomRow
            room={item}
            showRule={index > 0}
            onPress={() => router.push(`/chautari/${encodeURIComponent(item.slug)}`)}
          />
        )}
        ListEmptyComponent={
          rooms.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.quiet} />
            </View>
          ) : rooms.isError ? (
            <ErrorState
              title="Could not load conversations"
              message="Check your connection and try again."
              onRetry={() => void rooms.refetch()}
            />
          ) : (
            <EmptyState
              kicker="Nothing on air"
              title="No conversations right now"
              description="Chautari rooms open around the news. When one starts, it will appear here."
              actionLabel="Back to the front page"
              onAction={() => router.navigate("/")}
            />
          )
        }
        ListFooterComponent={
          upcoming.length > 0 ? (
            <View style={styles.sectionGap}>
              <SectionRule title="Coming up" />
              {upcoming.map((r, i) => (
                <RoomRow
                  key={r.slug}
                  room={r}
                  showRule={i > 0}
                  onPress={() => router.push(`/chautari/${encodeURIComponent(r.slug)}`)}
                />
              ))}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

/**
 * The host's entry point, shown only to someone who can actually use it.
 *
 * Entitlement is decided by the server, so this cannot know in advance
 * whether the tap will succeed — it offers, and the server refuses with a
 * readable message if the account is not entitled.
 */
function HostBar() {
  const router = useRouter();
  const { palette } = useTheme();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [dismissed, setDismissed] = useState(false);

  if (!isClerkConfigured || dismissed) return null;

  if (!isSignedIn) {
    return (
      <View style={[styles.hostBar, { borderColor: palette.rule2 }]}>
        <Text style={[styles.hostText, { color: palette.quiet }]}>
          Sign in to join a conversation or raise your hand.
        </Text>
        <Pressable
          onPress={() => router.push("/sign-in")}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.hostBtn,
            { backgroundColor: palette.ink },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.hostBtnText, { color: palette.paper }]}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.hostBar, { borderColor: palette.rule2 }]}>
      <Text style={[styles.hostText, { color: palette.quiet }]}>
        Signed in as {user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? "you"}.
      </Text>
      <Pressable
        onPress={() => router.push("/chautari/new")}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.hostBtn,
          { backgroundColor: palette.ink },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.hostBtnText, { color: palette.paper }]}>Open a room</Text>
      </Pressable>
      <Pressable onPress={() => setDismissed(true)} hitSlop={10}>
        <Text style={[styles.dismiss, { color: palette.quiet }]}>Hide</Text>
      </Pressable>
    </View>
  );
}

function RoomRow({
  room,
  showRule,
  onPress,
}: {
  room: DiscoverRoom;
  showRule: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const isLive = room.status === "live";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${room.title}. ${isLive ? "Live now" : "Scheduled"}. ${room.listeners} listening.`}
      style={({ pressed }) => [
        styles.row,
        showRule && { borderTopWidth: 1, borderTopColor: palette.rule, paddingTop: 18 },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowMeta}>
        {isLive ? (
          <View style={styles.liveWrap}>
            <View style={[styles.liveDot, { backgroundColor: palette.red }]} />
            <Text style={[styles.liveLabel, { color: palette.red }]}>Live</Text>
          </View>
        ) : (
          <Text style={[styles.liveLabel, { color: palette.quiet }]}>Scheduled</Text>
        )}
        {room.startedAt && isLive ? (
          <Text style={[styles.metaDim, { color: palette.quiet }]}>
            · started {timeAgo(room.startedAt)}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.roomTitle, { color: palette.ink }]}>{room.title}</Text>

      {room.description ? (
        <Text style={[styles.roomDesc, { color: palette.quiet }]} numberOfLines={2}>
          {room.description}
        </Text>
      ) : null}

      <Text style={[styles.roomFoot, { color: palette.quiet }]}>
        {room.hostName ? `${room.hostName} · ` : ""}
        {room.speakers} {room.speakers === 1 ? "speaker" : "speakers"} ·{" "}
        {room.listeners} listening
        {room.isFull ? " · full" : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.gutter, paddingBottom: 40 },
  hero: { paddingTop: 18, paddingBottom: 20, borderBottomWidth: 1 },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.6,
    marginTop: 6,
  },
  subtitle: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
  },
  hostBar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 18,
  },
  hostText: { flex: 1, fontFamily: fontFamilies.sansRegular, fontSize: 12, lineHeight: 17 },
  hostBtn: { paddingHorizontal: 14, minHeight: 34, justifyContent: "center" },
  hostBtnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  dismiss: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    textDecorationLine: "underline",
  },
  sectionGap: { marginTop: 26 },
  row: { paddingVertical: 18 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  metaDim: { fontFamily: fontFamilies.sansRegular, fontSize: 11.5 },
  roomTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.3,
    marginTop: 7,
  },
  roomDesc: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  roomFoot: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 9 },
  loading: { paddingVertical: 40, alignItems: "center" },
  pressed: { opacity: 0.75 },
});
