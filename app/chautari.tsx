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
import { feedState, roomSummary } from "@/features/chautari/feed";
import { isClerkConfigured } from "@/constants/config";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { formatDateTime, timeAgo } from "@/utils/format";
import { Avatar } from "@/components/chautari/Avatar";
import { AppHeader } from "@/components/AppHeader";
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
 *
 * ONE list, not two. Live rooms used to be `FlatList.data` while scheduled
 * ones rendered from `ListFooterComponent`, so with nothing live and
 * something scheduled the screen printed "No conversations right now"
 * directly above a populated "Coming up" section. Section headings are rows
 * now and emptiness is a property of the whole feed — see features/chautari/feed.ts.
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

  const state = feedState({
    rooms: rooms.data,
    isLoading: rooms.isLoading,
    isError: rooms.isError,
  });

  const openRoom = (room: DiscoverRoom) =>
    router.push({
      pathname: "/chautari/[slug]",
      /*
       * `title` is carried so the room header is not blank while the token
       * request is in flight. It is COSMETIC: the room screen replaces it
       * with the server's own title from the grant, and nothing anywhere
       * treats it as evidence of anything.
       */
      params: { slug: room.slug, title: room.title, host: room.hostName ?? "" },
    });

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <AppHeader showSectionBar={false} />

      <FlatList
        data={state.kind === "rows" ? state.rows : []}
        keyExtractor={(r) => r.key}
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
              <Text style={[styles.kicker, { color: palette.quiet }]}>Live conversation</Text>
              <Text style={[styles.title, { color: palette.ink }]}>Chautari</Text>
              <Text style={[styles.subtitle, { color: palette.quiet }]}>
                The platform under the tree, where the newsroom and its readers talk out loud.
                Listen in, or raise a hand to speak.
              </Text>
            </View>
            <HostBar />
            <EarnLink />
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "section" ? (
            <SectionHeading title={item.title} cta={item.cta} />
          ) : (
            <RoomRow
              room={item.room}
              showRule={!item.firstInSection}
              variant={item.variant}
              onPress={() => openRoom(item.room)}
            />
          )
        }
        ListEmptyComponent={
          /*
           * Reached only when the feed holds nothing at all — never while a
           * "Coming up" section is on screen.
           */
          state.kind === "loading" ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.quiet} />
            </View>
          ) : state.kind === "error" ? (
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
      />
    </View>
  );
}

function SectionHeading({ title, cta }: { title: string; cta?: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.sectionHeading, { borderBottomColor: palette.ink }]}>
      <Text style={[styles.sectionTitle, { color: palette.ink }]}>{title}</Text>
      {cta ? <Text style={[styles.sectionCta, { color: palette.quiet }]}>{cta}</Text> : null}
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
      {/* The only place the app named your account and gave you nowhere to go. */}
      <Pressable
        onPress={() => router.push("/profile")}
        accessibilityRole="button"
        accessibilityLabel="Open your profile"
        style={({ pressed }) => [styles.hostIdentity, pressed && styles.pressed]}
      >
        <Text style={[styles.hostText, { color: palette.quiet }]}>
          Signed in as{" "}
          <Text style={[styles.hostLink, { color: palette.ink }]}>
            {user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? "you"}
          </Text>
        </Text>
      </Pressable>
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
      <Pressable
        onPress={() => setDismissed(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Hide the hosting bar"
      >
        <Text style={[styles.dismiss, { color: palette.quiet }]}>Hide</Text>
      </Pressable>
    </View>
  );
}

/**
 * A room in the schedule.
 *
 * Two sizes, both built from the same nine fields the discovery endpoint
 * actually returns. The lead live room is set larger the way a front page
 * sets its lead; everything else is a compact row. No cards, no shadows —
 * a rule separates them, as everywhere else in this app.
 */
/**
 * One line pointing at the creator programme.
 *
 * Deliberately a line and not a card. The four requirements live on their own
 * screen (`chautari/earn.tsx`) because this page's job is to show what is on
 * air — four requirement cards here would push the live rooms below the fold
 * to serve the minority of readers who host.
 */
function EarnLink() {
  const router = useRouter();
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={() => router.push("/chautari/earn")}
      accessibilityRole="button"
      accessibilityLabel="Earn on Chautari — read the creator monetization requirements"
      style={({ pressed }) => [
        styles.earnRow,
        { borderBottomColor: palette.rule },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.earnText}>
        <Text style={[styles.earnTitle, { color: palette.ink }]}>Earn on Chautari</Text>
        <Text style={[styles.earnMeta, { color: palette.quiet }]} numberOfLines={1}>
          What the creator programme asks for
        </Text>
      </View>
      <Text style={[styles.earnChevron, { color: palette.quiet }]}>›</Text>
    </Pressable>
  );
}

function RoomRow({
  room,
  showRule,
  variant,
  onPress,
}: {
  room: DiscoverRoom;
  showRule: boolean;
  variant: "featured" | "compact";
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const isLive = room.status === "live";
  const featured = variant === "featured";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={roomSummary(room)}
      /*
       * A full room is marked, not disabled.
       *
       * The server admits two kinds of caller to a room at capacity: its host,
       * and anyone already counted in the occupancy who is reconnecting
       * (`decideAccess` in site/src/lib/chautari/authorize.ts). This payload
       * carries neither fact, so refusing the tap here would lock a host out
       * of their own room and block a dropped call from reconnecting. The row
       * says "Full" plainly and lets the server decide.
       */
      accessibilityHint={room.isFull ? "This room is full. Joining may not be possible." : undefined}
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
        {/*
          `scheduledFor` has been in the payload since Chautari shipped and
          was never rendered, so "Coming up" listed rooms with no indication
          of when. Kathmandu time, labelled, because the audience is spread
          from Sydney to Toronto and a bare clock time means nothing.
        */}
        {!isLive && room.scheduledFor ? (
          <Text style={[styles.metaDim, { color: palette.quiet }]}>
            · {formatDateTime(room.scheduledFor, "Asia/Kathmandu")} NPT
          </Text>
        ) : null}
        {room.isFull ? (
          /*
           * The whole row used to be rendered at `opacity: 0.6`, which pushed
           * the metadata — `quiet` on `paper`, already only ~4.95:1 — down to
           * roughly 2.4:1 against the paper behind it. Well under AA, for the
           * one row carrying information a reader most needs to read.
           *
           * The state lives in this chip now. Nothing else about a full room
           * is faded, so every count, name and timestamp keeps the contrast
           * it has everywhere else in the app.
           */
          <View style={[styles.fullChip, { backgroundColor: palette.paper2, borderColor: palette.rule2 }]}>
            <Text style={[styles.fullChipText, { color: palette.ink2 }]}>Full</Text>
          </View>
        ) : null}
      </View>

      <Text
        style={[featured ? styles.roomTitleLead : styles.roomTitle, { color: palette.ink }]}
      >
        {room.title}
      </Text>

      {room.description ? (
        <Text
          style={[styles.roomDesc, { color: palette.quiet }]}
          numberOfLines={featured ? 3 : 2}
        >
          {room.description}
        </Text>
      ) : null}

      <View style={styles.footRow}>
        {room.hostName ? (
          <>
            <Avatar name={room.hostName} size="sm" />
            <View style={styles.footText}>
              <Text style={[styles.hostName, { color: palette.ink2 }]} numberOfLines={1}>
                {room.hostName}
              </Text>
              <Text style={[styles.roomFoot, { color: palette.quiet }]}>{countsFor(room)}</Text>
            </View>
          </>
        ) : (
          <Text style={[styles.roomFoot, { color: palette.quiet }]}>{countsFor(room)}</Text>
        )}
      </View>

      {featured ? (
        <View style={[styles.leadCta, { borderColor: palette.ink }]}>
          <Text style={[styles.leadCtaText, { color: palette.ink }]}>
            {room.isFull ? "Try to join" : "Listen in"}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Counts, straight from the payload. Never estimated, never rounded. */
function countsFor(room: DiscoverRoom): string {
  const speakers = `${room.speakers} ${room.speakers === 1 ? "speaker" : "speakers"}`;
  return `${speakers} · ${room.listeners} listening`;
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
  hostIdentity: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center" },
  hostText: { fontFamily: fontFamilies.sansRegular, fontSize: 12, lineHeight: 17 },
  hostLink: {
    fontFamily: fontFamilies.sansMedium,
    textDecorationLine: "underline",
  },
  hostBtn: { paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
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
  earnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 12,
    marginTop: 18,
    borderBottomWidth: 1,
  },
  earnText: { flex: 1, minWidth: 0 },
  earnTitle: { fontFamily: fontFamilies.serifMedium, fontSize: 16 },
  earnMeta: { fontFamily: fontFamilies.sansRegular, fontSize: 11.5, marginTop: 2 },
  earnChevron: { fontFamily: fontFamilies.serifRegular, fontSize: 22 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginTop: 26,
  },
  sectionTitle: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  sectionCta: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  row: { paddingVertical: 18 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  liveWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  metaDim: { fontFamily: fontFamilies.sansRegular, fontSize: 11.5 },
  fullChip: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  fullChipText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  roomTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.3,
    marginTop: 7,
  },
  /* The lead live room, set like a front-page lead. */
  roomTitleLead: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.6,
    marginTop: 8,
  },
  roomDesc: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  footRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  footText: { flex: 1, minWidth: 0 },
  hostName: { fontFamily: fontFamilies.serifMedium, fontSize: 14.5 },
  roomFoot: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 1 },
  leadCta: {
    alignSelf: "flex-start",
    borderWidth: 1,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: "center",
    marginTop: 14,
  },
  leadCtaText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  loading: { paddingVertical: 40, alignItems: "center" },
  pressed: { opacity: 0.75 },
});
