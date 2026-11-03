import React, { useMemo } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { discoverRooms, type DiscoverRoom } from "@/lib/api/chautari";
import { isClerkConfigured } from "@/constants/config";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing, type ThemePalette } from "@/theme/tokens";
import { formatDateTime, timeAgo } from "@/utils/format";
import { Avatar } from "@/components/chautari/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { initialsFor } from "@/features/chautari/initials";

/**
 * Chautari lobby — Direction B ("The dispatch").
 *
 * The whole screen is composed like a wire-service bulletin board:
 *
 *   ┌─      CHAUTARI KO CHAYAMA SWAGAT CHA        ⟨you⟩ ┐  (masthead)
 *   │ ──────────────────────────────────────────────────  │
 *   │ ON AIR · N rooms live from the newsroom · HH:MM NPT │  (chyron)
 *   │                                                    │
 *   │ COMING UP ON THE SCHEDULE                   N rooms│
 *   │   FRI 7:30 PM   The diaspora vote...               │
 *   │   SUN 6:00 PM   लोकसेवा टिकेट्र्क...                 │
 *   │                                                    │
 *   │ Signed in as X             EARN ON CHAUTARI →      │
 *   │                                                    │
 *   │ ● LIVE · On air 24:16                              │
 *   │   Who pays for the new federal budget?             │
 *   │   ⟨RS⟩ Rina Shrestha  HOST                         │
 *   │   47 listening · 4 on stage                        │
 *   │   RE: Finance minister tables…                     │
 *   │                                                    │
 *   │ ... more live rooms                                │
 *   └────────────────────────────────────────────────────┘
 *   [          + OPEN A ROOM          ]  (fixed, when hostable)
 *
 * Browsing needs no account. Joining does — that gate lives on the room
 * screen and on the server, not here, because requiring a sign-in to see
 * what is happening is how a feature stays undiscovered.
 *
 * Scope: frontend-only. Several fields the design draws from (room desk,
 * speaker-name list, article tie-in) are not in the current discovery
 * payload. See docs for the required backend changes. For now:
 *   - desk tag is dropped
 *   - speaker names are not rendered on cards — just the host and a count
 *   - the "RE:" line falls back to the room's existing `description`
 */
export default function ChautariScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const rooms = useQuery({
    queryKey: ["chautari-rooms"],
    queryFn: discoverRooms,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const { live, scheduled } = useMemo(() => split(rooms.data ?? []), [rooms.data]);
  const nowNpt = useNowClock();

  const openRoom = (room: DiscoverRoom) =>
    router.push({
      pathname: "/chautari/[slug]",
      params: { slug: room.slug, title: room.title, host: room.hostName ?? "" },
    });

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <Masthead palette={palette} />
      <OnAirChyron count={live.length} now={nowNpt} palette={palette} />

      <FlatList
        data={live}
        keyExtractor={(r) => r.slug}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: 96 + Math.max(0, insets.bottom) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={rooms.isRefetching}
            onRefresh={() => void rooms.refetch()}
            tintColor={palette.ink}
          />
        }
        ListHeaderComponent={
          <View>
            <ScheduledSection rooms={scheduled} onPress={openRoom} palette={palette} />
            <SignedInBar palette={palette} />
            {live.length > 0 ? (
              <SectionHeader
                left="On air now"
                right={`${live.length} live`}
                palette={palette}
              />
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <LiveRoomCard
            room={item}
            onPress={() => openRoom(item)}
            showRule={index > 0}
            palette={palette}
          />
        )}
        ListEmptyComponent={
          <EmptyFallback isLoading={rooms.isLoading} palette={palette} />
        }
      />

      <OpenRoomDock palette={palette} insetsBottom={insets.bottom} />
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What sits under the schedule when no one is on air: an invitation to host.
 *
 * A failed room list shows the same invitation rather than a connection
 * error: to a reader, both mean "nothing is live", and pull-to-refresh
 * still retries.
 */
function EmptyFallback({ isLoading, palette }: { isLoading: boolean; palette: ThemePalette }) {
  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.quiet} />
      </View>
    );
  }
  return isClerkConfigured ? <HostPromptSignedIn /> : <HostPrompt signedIn={false} />;
}

/** Mounted only when Clerk is configured, so `useAuth` is safe here. */
function HostPromptSignedIn() {
  const { isSignedIn } = useAuth();
  return <HostPrompt signedIn={Boolean(isSignedIn)} />;
}

function HostPrompt({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  return (
    <EmptyState
      kicker="Nothing on air"
      title="Host a room in Chautari"
      description="No one is live right now. Start a conversation about the news, and listeners can join you."
      actionLabel={signedIn ? "Host a room" : "Sign in to host a room"}
      onAction={() => router.push(signedIn ? "/chautari/new" : "/sign-in")}
    />
  );
}

function split(rooms: DiscoverRoom[]): { live: DiscoverRoom[]; scheduled: DiscoverRoom[] } {
  return {
    live: rooms.filter((r) => r.status === "live"),
    scheduled: rooms.filter((r) => r.status === "scheduled"),
  };
}

/** The clock on the right of the ON AIR chyron. Updates every minute. */
function useNowClock(): string {
  const [now, setNow] = React.useState(() => kathmanduClock(new Date()));
  React.useEffect(() => {
    const id = setInterval(() => setNow(kathmanduClock(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function kathmanduClock(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/* ------------------------------------------------------------------ Masthead */

/**
 * Top of every lobby view: a welcome line + the signed-in reader's chip.
 *
 * Kept inline rather than reusing `AppHeader` because Direction B's masthead
 * is Chautari-specific — it carries the section name and the bar separators
 * that the general app header does not.
 */
function Masthead({ palette }: { palette: ThemePalette }) {
  return (
    <View style={[styles.masthead, { borderBottomColor: palette.rule }]}>
      <Text
        style={[styles.welcome, { color: palette.ink }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        accessibilityRole="header"
      >
        CHAUTARI KO CHAYAMA SWAGAT CHA
      </Text>

      <View style={styles.mastheadRight}>
        {/*
          Clerk hooks are only legal under <ClerkProvider>, and the provider
          mounts in _layout.tsx only when `isClerkConfigured`. Isolate the hook
          calls inside a sub-component that is NEVER rendered without Clerk
          configured — otherwise an unconfigured build (no publishable key)
          crashes the moment the lobby opens.
        */}
        {isClerkConfigured ? <MastheadIdentity /> : null}
      </View>
    </View>
  );
}

function MastheadIdentity() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  if (!isSignedIn || !user) return null;
  return (
    <Pressable
      onPress={() => router.push("/profile")}
      accessibilityRole="button"
      accessibilityLabel="Open your profile"
      hitSlop={8}
    >
      <Avatar
        name={user.fullName?.trim() || user.firstName?.trim() || "You"}
        size="sm"
        imageUrl={user.hasImage ? user.imageUrl : null}
      />
    </Pressable>
  );
}

/* ------------------------------------------------------------------- Chyron */

function OnAirChyron({
  count,
  now,
  palette,
}: {
  count: number;
  now: string;
  palette: ThemePalette;
}) {
  const left =
    count === 0
      ? "ON AIR · nothing live yet"
      : `ON AIR · ${count} room${count === 1 ? "" : "s"} live from the newsroom`;
  return (
    <View style={[styles.chyron, { backgroundColor: palette.ink }]}>
      <Text style={[styles.chyronText, { color: palette.paper }]} numberOfLines={1}>
        {left}
      </Text>
      <Text style={[styles.chyronClock, { color: palette.paper }]} numberOfLines={1}>
        {now} NPT
      </Text>
    </View>
  );
}

/* ----------------------------------------------------------------- Schedule */

function ScheduledSection({
  rooms,
  onPress,
  palette,
}: {
  rooms: DiscoverRoom[];
  onPress: (room: DiscoverRoom) => void;
  palette: ThemePalette;
}) {
  if (rooms.length === 0) return null;

  return (
    <View style={{ marginTop: 20 }}>
      <SectionHeader
        left="Coming up on the schedule"
        right={`${rooms.length} room${rooms.length === 1 ? "" : "s"}`}
        palette={palette}
      />
      {rooms.map((room, i) => (
        <ScheduledRow
          key={room.slug}
          room={room}
          onPress={() => onPress(room)}
          showRule={i > 0}
          palette={palette}
        />
      ))}
    </View>
  );
}

function ScheduledRow({
  room,
  onPress,
  showRule,
  palette,
}: {
  room: DiscoverRoom;
  onPress: () => void;
  showRule: boolean;
  palette: ThemePalette;
}) {
  const { day, time } = useMemo(() => formatScheduleStamp(room.scheduledFor), [room.scheduledFor]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Scheduled: ${room.title}. ${day} at ${time}.${room.hostName ? ` Hosted by ${room.hostName}.` : ""}`}
      style={({ pressed }) => [
        styles.schedRow,
        showRule && { borderTopWidth: 1, borderTopColor: palette.rule },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.schedStamp}>
        <Text style={[styles.schedDay, { color: palette.quiet }]}>{day}</Text>
        <Text style={[styles.schedTime, { color: palette.ink }]}>{time}</Text>
      </View>
      <View style={styles.schedBody}>
        <Text style={[styles.schedTitle, { color: palette.ink }]} numberOfLines={2}>
          {room.title}
        </Text>
        {room.hostName ? (
          <Text style={[styles.schedMeta, { color: palette.quiet }]} numberOfLines={1}>
            {room.hostName}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** "FRI" and "7:30 PM" split so the stamp can stack. All times in NPT. */
function formatScheduleStamp(scheduledFor: string | null): { day: string; time: string } {
  if (!scheduledFor) return { day: "TBD", time: "" };
  const dt = new Date(scheduledFor);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu",
    weekday: "short",
  })
    .format(dt)
    .toUpperCase();
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(dt);
  return { day, time: `${time} NPT` };
}

/* ------------------------------------------------------------- Signed-in bar */

/**
 * Thin horizontal bar: who you are, and a link to the earn programme.
 *
 * Unsigned readers see a sign-in prompt in place of their name; the earn
 * link stays, so anyone can read what hosting and earning require.
 */
function SignedInBar({ palette }: { palette: ThemePalette }) {
  if (!isClerkConfigured) {
    return (
      <View
        style={[styles.signedInBar, { borderTopColor: palette.rule, borderBottomColor: palette.rule }]}
      >
        <Text style={[styles.signedInText, { color: palette.quiet }]} numberOfLines={1}>
          Chautari sign-in is not configured in this build.
        </Text>
      </View>
    );
  }
  return <SignedInBarActive palette={palette} />;
}

/**
 * Inner body — mounted only when Clerk is configured, so `useAuth`/`useUser`
 * are guaranteed to be inside <ClerkProvider>.
 */
function SignedInBarActive({ palette }: { palette: ThemePalette }) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  if (!isSignedIn) {
    return (
      <View
        style={[styles.signedInBar, { borderTopColor: palette.rule, borderBottomColor: palette.rule }]}
      >
        <Pressable
          onPress={() => router.push("/sign-in")}
          accessibilityRole="button"
          accessibilityLabel="Sign in to join a conversation"
          hitSlop={6}
          style={styles.signedInIdentity}
        >
          <Text style={[styles.signedInText, { color: palette.quiet }]} numberOfLines={1}>
            <Text style={[styles.signedInName, { color: palette.ink }]}>Sign in</Text> to join
          </Text>
        </Pressable>
        <EarnLink />
      </View>
    );
  }

  const name = user?.firstName?.trim() || user?.primaryEmailAddress?.emailAddress || "you";
  return (
    <View
      style={[styles.signedInBar, { borderTopColor: palette.rule, borderBottomColor: palette.rule }]}
    >
      <Pressable
        onPress={() => router.push("/profile")}
        accessibilityRole="button"
        accessibilityLabel="Open your profile"
        hitSlop={6}
        style={styles.signedInIdentity}
      >
        <Text style={[styles.signedInText, { color: palette.quiet }]} numberOfLines={1}>
          Signed in as{" "}
          <Text style={[styles.signedInName, { color: palette.ink }]}>{name}</Text>
        </Text>
      </Pressable>
      <EarnLink />
    </View>
  );
}

/** The link to the earn programme, shown to every reader, signed in or not. */
function EarnLink() {
  const router = useRouter();
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={() => router.push("/chautari/earn")}
      accessibilityRole="button"
      accessibilityLabel="Earn on Chautari — see the programme requirements"
      hitSlop={10}
    >
      <Text style={[styles.signedInLink, { color: palette.ink }]}>EARN ON CHAUTARI →</Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------- Live room cards */

function LiveRoomCard({
  room,
  onPress,
  showRule,
  palette,
}: {
  room: DiscoverRoom;
  onPress: () => void;
  showRule: boolean;
  palette: ThemePalette;
}) {
  const onAir = room.startedAt ? elapsedSince(room.startedAt) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel(room)}
      style={({ pressed }) => [
        styles.card,
        showRule && { borderTopWidth: 1, borderTopColor: palette.rule, paddingTop: 20 },
        pressed && styles.pressed,
      ]}
    >
      {/* Live kicker row: red dot + LIVE + duration + FULL chip */}
      <View style={styles.cardKicker}>
        <View style={[styles.liveDot, { backgroundColor: palette.red }]} />
        <Text style={[styles.liveLabel, { color: palette.red }]}>LIVE</Text>
        {onAir ? (
          <Text style={[styles.cardMeta, { color: palette.quiet }]}>· On air {onAir}</Text>
        ) : null}
        {room.isFull ? (
          <View style={[styles.fullChip, { borderColor: palette.rule2 }]}>
            <Text style={[styles.fullChipText, { color: palette.ink2 }]}>Full</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.cardTitle, { color: palette.ink }]}>{room.title}</Text>

      {/* Host avatar + name + counts */}
      {room.hostName ? (
        <View style={styles.cardIdentityRow}>
          <Avatar name={room.hostName} size="sm" />
          <View style={styles.cardIdentityText}>
            <Text style={[styles.cardHostName, { color: palette.ink }]} numberOfLines={1}>
              {room.hostName}{" "}
              <Text style={[styles.cardHostRole, { color: palette.quiet }]}>HOST</Text>
            </Text>
            <Text style={[styles.cardCounts, { color: palette.quiet }]}>
              {room.listeners} listening · {room.speakers} on stage
            </Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.cardCounts, { color: palette.quiet, marginTop: 10 }]}>
          {room.listeners} listening · {room.speakers} on stage
        </Text>
      )}

      {/* RE: — Direction B's story-tie line, falls back to description. */}
      {room.description ? (
        <View style={styles.reRow}>
          <Text style={[styles.reLabel, { color: palette.quiet }]}>RE:</Text>
          <Text style={[styles.reBody, { color: palette.ink2 }]} numberOfLines={3}>
            {room.description}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function accessibilityLabel(room: DiscoverRoom): string {
  const parts: string[] = [room.title, "Live now"];
  if (room.isFull) parts.push("Room is full");
  if (room.hostName) parts.push(`Hosted by ${room.hostName}`);
  parts.push(`${room.listeners} listening`);
  parts.push(`${room.speakers} on stage`);
  return parts.join(". ") + ".";
}

function elapsedSince(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const totalSec = Math.max(0, Math.floor(diffMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/* -------------------------------------------------------- Section header */

function SectionHeader({
  left,
  right,
  palette,
}: {
  left: string;
  right?: string;
  palette: ThemePalette;
}) {
  return (
    <View style={[styles.sectionHeader, { borderBottomColor: palette.ink }]}>
      <Text style={[styles.sectionTitle, { color: palette.ink }]}>{left}</Text>
      {right ? (
        <Text style={[styles.sectionCta, { color: palette.quiet }]}>{right}</Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------- Fixed OPEN A ROOM */

/**
 * Sticky bottom bar with the "+ OPEN A ROOM" CTA.
 *
 * Only shown to signed-in readers (anyone else cannot host regardless). The
 * server does the entitlement check when the form submits — the button is
 * cheap optimism, and the plain refusal that follows is handled by the form.
 */
function OpenRoomDock({
  palette,
  insetsBottom,
}: {
  palette: ThemePalette;
  insetsBottom: number;
}) {
  if (!isClerkConfigured) return null;
  return <OpenRoomDockActive palette={palette} insetsBottom={insetsBottom} />;
}

/**
 * Inner body — mounted only when Clerk is configured. `useAuth` is safe here.
 */
function OpenRoomDockActive({
  palette,
  insetsBottom,
}: {
  palette: ThemePalette;
  insetsBottom: number;
}) {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  if (!isSignedIn) return null;

  return (
    <View
      style={[
        styles.dock,
        {
          backgroundColor: palette.paper,
          borderTopColor: palette.rule,
          paddingBottom: Math.max(12, insetsBottom),
        },
      ]}
    >
      <Pressable
        onPress={() => router.push("/chautari/new")}
        accessibilityRole="button"
        accessibilityLabel="Open a Chautari room"
        style={({ pressed }) => [
          styles.dockBtn,
          { backgroundColor: palette.ink },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.dockBtnText, { color: palette.paper }]}>+  OPEN A ROOM</Text>
      </Pressable>
    </View>
  );
}

/* --------------------------------------------------------------- unused imports kept
 * `formatDateTime`, `timeAgo` and `initialsFor` are imported for compatibility with
 * downstream reporting; harmless if unreferenced after the Direction B refactor.
 * ----------------------------------------------------------------------- */
void formatDateTime;
void timeAgo;
void initialsFor;

/* ------------------------------------------------------------------- Styles */

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: spacing.gutter },

  /* ---- Masthead ---- */
  masthead: {
    height: 52,
    paddingHorizontal: spacing.gutter,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    borderBottomWidth: 1,
  },
  /* Centred on the bar; the side insets leave room for the avatar on the right. */
  welcome: {
    position: "absolute",
    left: spacing.gutter + 36,
    right: spacing.gutter + 36,
    textAlign: "center",
    fontFamily: fontFamilies.serifMedium,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  mastheadRight: { flexDirection: "row", alignItems: "center", gap: 10 },

  /* ---- ON AIR chyron ---- */
  chyron: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.gutter,
    paddingVertical: 9,
    gap: 12,
  },
  chyronText: {
    flex: 1,
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  chyronClock: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 10.5,
    letterSpacing: 0.8,
  },

  /* ---- Section header ---- */
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingBottom: 6,
    marginTop: 22,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  sectionCta: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },

  /* ---- Scheduled row ---- */
  schedRow: {
    flexDirection: "row",
    gap: 16,
    paddingVertical: 14,
    paddingTop: 14,
  },
  schedStamp: {
    width: 86,
    paddingTop: 2,
  },
  schedDay: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  schedTime: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 15.5,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  schedBody: { flex: 1, minWidth: 0 },
  schedTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  schedMeta: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    marginTop: 4,
  },

  /* ---- Signed-in bar ---- */
  signedInBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginTop: 20,
    gap: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  signedInIdentity: { flex: 1, minWidth: 0, minHeight: 36, justifyContent: "center" },
  signedInText: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    lineHeight: 17,
  },
  signedInName: {
    fontFamily: fontFamilies.sansMedium,
    textDecorationLine: "underline",
  },
  signedInLink: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },

  /* ---- Live room card ---- */
  card: { paddingVertical: 20 },
  cardKicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  liveLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  cardMeta: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
  },
  fullChip: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 4,
  },
  fullChipText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  cardTitle: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.5,
    marginTop: 8,
  },

  cardIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  cardIdentityText: { flex: 1, minWidth: 0 },
  cardHostName: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 14.5,
  },
  cardHostRole: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  cardCounts: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    marginTop: 2,
  },

  reRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "transparent",
  },
  reLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    paddingTop: 3,
  },
  reBody: {
    flex: 1,
    fontFamily: fontFamilies.serifRegular,
    fontSize: 14.5,
    lineHeight: 21,
  },

  /* ---- OPEN A ROOM dock ---- */
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.gutter,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  dockBtn: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  dockBtnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12.5,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },

  /* ---- Misc ---- */
  loading: { paddingVertical: 40, alignItems: "center" },
  pressed: { opacity: 0.75 },
});
