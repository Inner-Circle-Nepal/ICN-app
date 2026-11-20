import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";

import { isClerkConfigured } from "@/constants/config";
import { getMyRooms, type MyRoom } from "@/lib/api/chautari";
import { formatBooking } from "@/features/chautari/schedule";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { ErrorState } from "@/components/ErrorState";

/**
 * Your rooms: everything you host or moderate that is live or booked.
 *
 * The place a host comes back to after scheduling. Tapping a booked room
 * opens its waiting room, which is where Go live and Cancel live.
 */
export default function MyRoomsScreen() {
  if (!isClerkConfigured) return <MyRoomsUnavailable />;
  return <MyRoomsActive />;
}

function MyRoomsUnavailable() {
  const router = useRouter();
  return (
    <Frame onBack={() => (router.canGoBack() ? router.back() : router.replace("/chautari"))}>
      <ErrorState title="Rooms are unavailable" message="This build has no account system." />
    </Frame>
  );
}

function MyRoomsActive() {
  const router = useRouter();
  const { palette } = useTheme();
  const { isSignedIn, getToken } = useAuth();

  const rooms = useQuery({
    queryKey: ["chautari-my-rooms"],
    queryFn: () => getMyRooms(getToken),
    enabled: Boolean(isSignedIn),
    refetchInterval: 60_000,
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/chautari"));

  if (!isSignedIn) {
    return (
      <Frame onBack={back}>
        <ErrorState
          title="Sign in to see your rooms"
          message="Rooms you host or moderate appear here."
          onRetry={() => router.push("/sign-in")}
        />
      </Frame>
    );
  }

  return (
    <Frame onBack={back}>
      <FlatList
        data={rooms.data ?? []}
        keyExtractor={(r) => r.slug}
        contentContainerStyle={styles.body}
        refreshing={rooms.isRefetching}
        onRefresh={() => void rooms.refetch()}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.kicker, { color: palette.quiet }]}>Chautari</Text>
            <Text style={[styles.title, { color: palette.ink }]}>Your rooms</Text>
            <Text style={[styles.sub, { color: palette.quiet }]}>
              Rooms you host or moderate. Open a scheduled one to go live or cancel it.
            </Text>
          </View>
        }
        ListEmptyComponent={
          rooms.isLoading ? undefined : rooms.isError ? (
            <ErrorState
              title="Could not load your rooms"
              message="Check your connection and try again."
              onRetry={() => void rooms.refetch()}
            />
          ) : (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: palette.quiet }]}>
                Nothing on your schedule. Rooms you host or are made a moderator of show up here.
              </Text>
              <Pressable
                onPress={() => router.push("/chautari/new")}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.cta,
                  { backgroundColor: palette.ink },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.ctaText, { color: palette.paper }]}>Open or schedule a room</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item }) => (
          <RoomRow
            room={item}
            onPress={() => router.push(`/chautari/${encodeURIComponent(item.slug)}`)}
          />
        )}
      />
    </Frame>
  );
}

function RoomRow({ room, onPress }: { room: MyRoom; onPress: () => void }) {
  const { palette } = useTheme();
  const live = room.status === "live";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${room.title}. ${live ? "Live now" : room.scheduledFor ? formatBooking(room.scheduledFor) : "Scheduled"}. You are ${room.role === "host" ? "the host" : "a moderator"}.`}
      style={({ pressed }) => [styles.row, { borderBottomColor: palette.rule }, pressed && styles.pressed]}
    >
      <View style={[styles.thumb, { backgroundColor: palette.paper2 }]}>
        {room.bannerUrl ? (
          <Image source={{ uri: room.bannerUrl }} style={styles.thumbImage} contentFit="cover" />
        ) : null}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowStatus, { color: live ? palette.red : palette.quiet }]}>
          {live ? "● Live now" : room.scheduledFor ? formatBooking(room.scheduledFor) : "Scheduled"}
        </Text>
        <Text style={[styles.rowTitle, { color: palette.ink }]} numberOfLines={2}>
          {room.title}
        </Text>
        <Text style={[styles.rowRole, { color: palette.quiet }]}>
          {room.role === "host" ? "You host" : "You moderate"}
        </Text>
      </View>
    </Pressable>
  );
}

function Frame({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <View style={[styles.topBar, { borderBottomColor: palette.rule }]}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M19 12H5M11 6l-6 6 6 6"
              stroke={palette.ink}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={[styles.backLabel, { color: palette.ink }]}>Chautari</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    height: 48,
    paddingHorizontal: spacing.gutter,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36 },
  backLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  body: { paddingHorizontal: spacing.gutter, paddingBottom: 40 },
  header: { paddingTop: 20, paddingBottom: 8 },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: { fontFamily: fontFamilies.serifLight, fontSize: 30, lineHeight: 35, marginTop: 6 },
  sub: { fontFamily: fontFamilies.serifRegular, fontSize: 15, lineHeight: 22, marginTop: 8 },
  row: { flexDirection: "row", gap: 14, paddingVertical: 14, borderBottomWidth: 1 },
  thumb: { width: 104, aspectRatio: 16 / 9, overflow: "hidden" },
  thumbImage: { width: "100%", height: "100%" },
  rowText: { flex: 1, minWidth: 0 },
  rowStatus: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  rowTitle: { fontFamily: fontFamilies.serifMedium, fontSize: 16.5, lineHeight: 21, marginTop: 4 },
  rowRole: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 4 },
  empty: { paddingTop: 24 },
  emptyText: { fontFamily: fontFamilies.serifRegular, fontSize: 15.5, lineHeight: 23 },
  cta: { marginTop: 20, minHeight: 48, alignItems: "center", justifyContent: "center" },
  ctaText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  pressed: { opacity: 0.75 },
});
