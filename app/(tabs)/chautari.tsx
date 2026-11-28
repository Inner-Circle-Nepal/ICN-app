import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { discoverRooms, type DiscoverRoom } from "@/lib/api/chautari";
import { useLiveRoomList } from "@/features/chautari/useLiveRoomList";
import { useEnterExitList } from "@/features/chautari/useEnterExitList";
import { ENTER_MS, EXIT_MS, EnterExit } from "@/components/chautari/EnterExit";
import { isClerkConfigured } from "@/constants/config";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing, type ThemePalette } from "@/theme/tokens";
import { Avatar } from "@/components/chautari/Avatar";
import { LiveRoomCard, UpcomingRail } from "@/components/chautari/LobbyCards";
import { EmptyState } from "@/components/EmptyState";
import { useMyProfile } from "@/features/profile/useMyProfile";

/**
 * Chautari lobby — Direction B ("The dispatch").
 *
 * The whole screen is composed like a wire-service bulletin board:
 *
 *   ┌─      CHAUTARI KO CHAYAMA SWAGAT CHA        ⟨you⟩ ┐  (masthead)
 *   │ ──────────────────────────────────────────────────  │
 *   │ ON AIR · N rooms live from the newsroom · HH:MM NPT │  (chyron)
 *   │ Signed in as X             EARN ON CHAUTARI →      │
 *   │                                                    │
 *   │ ON AIR NOW                                  N live │
 *   │ ┌[ cover photo · LIVE 24 min ]──────────────────┐  │
 *   │ │ Who pays for the new federal budget?          │  │
 *   │ │ ⟨RS⟩ Rina Shrestha · 51 in the room  LISTEN IN│  │
 *   │ └───────────────────────────────────────────────┘  │
 *   │                                                    │
 *   │ COMING UP                         N on the schedule│
 *   │ [cover SAT 7:30][cover SUN 6:00][...  → scrolls    │
 *   └────────────────────────────────────────────────────┘
 *   [ YOUR ROOMS ][      + OPEN A ROOM      ]  (signed in)
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
const ROOMS_KEY = ["chautari-rooms"] as const;

const roomKey = (r: DiscoverRoom) => r.slug;
/** How long an ended room stays to animate out (and a new one counts as new). */
const HOLD_MS = Math.max(ENTER_MS, EXIT_MS) + 80;

export default function ChautariScreen() {
  // Clerk's hooks need <ClerkProvider>, which exists only when configured.
  return isClerkConfigured ? <ChautariForAccount /> : <ChautariLobby />;
}

/**
 * A suspended reader can't join, host, chat or invite, so the whole tab says
 * so once, with the reason and how to appeal, instead of listing rooms that
 * would each refuse them. The server refuses regardless; this is the honest
 * screen. Re-checked whenever the tab comes into view, so a suspension that
 * was lifted shows the rooms again straight away.
 */
function ChautariForAccount() {
  const { suspension, refetch } = useMyProfile();
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  return suspension ? <ChautariSuspended message={suspension.message} /> : <ChautariLobby />;
}

function ChautariSuspended({ message }: { message: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <Masthead palette={palette} />
      <EmptyState
        kicker="Account suspended"
        title="Chautari isn't available to you"
        description={message}
        actionLabel="Email the newsroom"
        onAction={() =>
          void Linking.openURL(
            `mailto:newsroom@icn.news?subject=${encodeURIComponent("Appeal: account suspension")}`,
          )
        }
      />
    </View>
  );
}

function ChautariLobby() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const rooms = useQuery({
    queryKey: ROOMS_KEY,
    queryFn: discoverRooms,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    /*
     * Fail fast to a visible error instead of spinning through the default
     * three retries. The Chautari API itself uses a 6s timeout per request;
     * one retry 1.5s later caps the total loading window at ~14s in the worst
     * case rather than the ~60s the default surfaced during the recent outage.
     */
    retry: 1,
    retryDelay: 1500,
    /*
     * While a refetch is in flight after the first successful load, keep the
     * previous rooms on screen rather than flashing a spinner — a one-minute
     * poll that briefly blanks the schedule feels much worse than one that
     * updates in place.
     */
    placeholderData: keepPreviousData,
  });
  // Rooms going live or ending show up at once, not on the next poll.
  useLiveRoomList(ROOMS_KEY);

  const { live, scheduled } = useMemo(() => split(rooms.data ?? []), [rooms.data]);
  // Rooms going live animate in; ended ones stay a moment to animate out.
  const shownLive = useEnterExitList(rooms.data ? live : undefined, roomKey, HOLD_MS);
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
        data={shownLive}
        keyExtractor={(row) => row.key}
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
        renderItem={({ item: row }) => (
          <EnterExit entering={row.entering} leaving={row.leaving}>
            <LiveRoomCard room={row.item} onPress={() => openRoom(row.item)} />
          </EnterExit>
        )}
        ListEmptyComponent={
          <EmptyFallback isLoading={rooms.isLoading} palette={palette} />
        }
        ListFooterComponent={<UpcomingRail rooms={scheduled} onPress={openRoom} />}
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
  const { isLoaded, isSignedIn } = useAuth();
  // Until Clerk has read the saved sign-in, don't offer "Sign in to host".
  if (!isLoaded) return null;
  return <HostPrompt signedIn={Boolean(isSignedIn)} />;
}

/**
 * Signed-in readers already have "+ OPEN A ROOM" fixed at the foot of the
 * screen, so the prompt points to it instead of adding a second button that
 * does the same thing. Signed-out readers do not see that bar, so they get
 * the sign-in button here.
 */
function HostPrompt({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  return (
    <EmptyState
      kicker="Nothing on air"
      title="Host a room in Chautari"
      description={
        signedIn
          ? "No one is live right now. Tap Open a room below to start a conversation about the news."
          : "No one is live right now. Sign in to start a conversation about the news."
      }
      actionLabel={signedIn ? undefined : "Sign in to host a room"}
      onAction={signedIn ? undefined : () => router.push("/sign-in")}
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
  const { profile } = useMyProfile();
  if (!isSignedIn || !user) return null;
  return (
    <Pressable
      onPress={() => router.push("/profile")}
      accessibilityRole="button"
      accessibilityLabel="Open your profile"
      hitSlop={8}
    >
      <Avatar
        name={profile?.display_name ?? "You"}
        size="sm"
        imageUrl={profile?.avatar_url ?? (user.hasImage ? user.imageUrl : null)}
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
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { profile } = useMyProfile();

  // Clerk is still reading the saved sign-in: neither "Sign in" nor a name
  // yet, only the bar and the earn link, so nothing wrong flashes.
  if (!isLoaded) {
    return (
      <View
        style={[styles.signedInBar, { borderTopColor: palette.rule, borderBottomColor: palette.rule }]}
      >
        <View style={styles.signedInIdentity} />
        <EarnLink />
      </View>
    );
  }

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

  const name = profile?.display_name || user?.primaryEmailAddress?.emailAddress || "you";
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
      <View style={styles.dockRow}>
        <Pressable
          onPress={() => router.push("/chautari/mine")}
          accessibilityRole="button"
          accessibilityLabel="Your rooms: ones you host or moderate"
          style={({ pressed }) => [
            styles.dockBtn,
            styles.dockSecondary,
            { borderColor: palette.ink },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.dockBtnText, { color: palette.ink }]}>Your rooms</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/chautari/new")}
          accessibilityRole="button"
          accessibilityLabel="Open or schedule a Chautari room"
          style={({ pressed }) => [
            styles.dockBtn,
            styles.dockPrimary,
            { backgroundColor: palette.ink },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.dockBtnText, { color: palette.paper }]}>+  Open a room</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
  dockRow: { flexDirection: "row", gap: 10 },
  dockBtn: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  dockSecondary: { borderWidth: 1, paddingHorizontal: 18 },
  dockPrimary: { flex: 1 },
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
