import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { Avatar } from "@/components/chautari/Avatar";
import { ErrorState } from "@/components/ErrorState";
import { useProfile } from "@/features/profile/useProfile";
import { useFollowMutation, useFollowStatus, useUnfollowMutation } from "@/features/profile/useFollow";
import { ReaderApiError } from "@/lib/api/readerProfile";
import { BottomSheet } from "@/components/chautari/BottomSheet";
import { FollowAlertPrompt, FollowAlertToggle } from "@/components/FollowAlertPrompt";

/**
 * Public reader profile — reachable at `/user/<handle>`.
 *
 * Rendered from an unauthenticated view too (anon readers can browse any
 * profile). The follow button routes an unauthenticated tap to `/sign-in`
 * rather than disabling: a tap that does nothing is worse than a tap that
 * explains why.
 *
 * Initials come from `display_name` via the existing `Avatar` fallback;
 * `avatar_url` is rendered when present. No image upload happens here —
 * uploading lives in `app/profile.tsx` (edited in PR 5).
 */

export default function PublicProfileScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const raw = Array.isArray(params.username) ? params.username[0] : params.username;
  const handle = raw ? decodeURIComponent(raw).toLowerCase() : "";

  const profileQuery = useProfile(handle);
  const statusQuery = useFollowStatus(handle);
  const followMut = useFollowMutation();
  const unfollowMut = useUnfollowMutation();

  const profile = profileQuery.data ?? null;
  const status = statusQuery.data ?? null;
  const isLoading = profileQuery.isLoading;
  // Right after following: ask whether to hear about their Chautari rooms.
  const [askAlerts, setAskAlerts] = useState(false);

  const handleFollow = useCallback(() => {
    if (!profile || !status) return;
    if (status.is_self) return;
    if (status.is_following) {
      unfollowMut.mutate(profile.username);
    } else {
      followMut.mutate(profile.username, {
        onSuccess: (res) => {
          if (!res.already_following) setAskAlerts(true);
        },
        onError: (e) => {
          const err = e as ReaderApiError;
          if (err.reason === "not_signed_in") router.push("/sign-in");
        },
      });
    }
  }, [followMut, unfollowMut, profile, status, router]);

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Back bar */}
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={10}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
              d="M15 6l-6 6 6 6"
              stroke={palette.ink}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.ink} />
          </View>
        ) : profileQuery.isError && !profile ? (
          <ErrorState
            title="Could not load this profile"
            message="Check your connection and try again."
            onRetry={() => void profileQuery.refetch()}
          />
        ) : !profile ? (
          <View style={styles.missing}>
            <Text style={[styles.kicker, { color: palette.quiet }]}>Not found</Text>
            <Text style={[styles.title, { color: palette.ink }]}>
              No reader goes by @{handle}
            </Text>
            <Text style={[styles.subtitle, { color: palette.quiet }]}>
              Double-check the spelling, or go back and try another profile.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Avatar
                name={profile.display_name}
                imageUrl={profile.avatar_url}
                size="lg"
              />
              <Text style={[styles.name, { color: palette.ink }]}>
                {profile.display_name}
              </Text>
              <Text style={[styles.handle, { color: palette.quiet }]}>
                @{profile.username}
              </Text>
              {profile.bio ? (
                <Text style={[styles.bio, { color: palette.ink2 }]}>{profile.bio}</Text>
              ) : null}
            </View>

            <View style={[styles.statsRow, { borderTopColor: palette.rule, borderBottomColor: palette.rule }]}>
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: palette.ink }]}>
                  {status?.follower_count ?? 0}
                </Text>
                <Text style={[styles.statLabel, { color: palette.quiet }]}>
                  {status?.follower_count === 1 ? "follower" : "followers"}
                </Text>
              </View>
            </View>

            {status?.is_self ? (
              <Text style={[styles.selfNote, { color: palette.quiet }]}>
                This is your public profile.
              </Text>
            ) : (
              <Pressable
                onPress={handleFollow}
                disabled={followMut.isPending || unfollowMut.isPending || !status}
                style={[
                  styles.followBtn,
                  {
                    backgroundColor: status?.is_following ? "transparent" : palette.ink,
                    borderColor: palette.ink,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={status?.is_following ? "Unfollow" : "Follow"}
              >
                {followMut.isPending || unfollowMut.isPending ? (
                  <ActivityIndicator color={status?.is_following ? palette.ink : palette.paper} />
                ) : (
                  <Text
                    style={[
                      styles.followText,
                      { color: status?.is_following ? palette.ink : palette.paper },
                    ]}
                  >
                    {status?.is_following ? "Following" : "Follow"}
                  </Text>
                )}
              </Pressable>
            )}

            {status?.is_following && !status.is_self ? (
              <FollowAlertToggle
                name={profile.display_name}
                username={profile.username}
                value={status.notify ?? false}
              />
            ) : null}
          </>
        )}
      </ScrollView>

      {profile ? (
        <BottomSheet visible={askAlerts} onClose={() => setAskAlerts(false)}>
          <FollowAlertPrompt
            name={profile.display_name}
            username={profile.username}
            onDone={() => setAskAlerts(false)}
          />
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 12,
    paddingBottom: 48,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -6,
  },
  loading: {
    marginTop: 80,
    alignItems: "center",
  },
  missing: {
    marginTop: 60,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  header: {
    alignItems: "center",
    marginTop: 24,
  },
  name: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 26,
    marginTop: 14,
    textAlign: "center",
  },
  handle: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 14,
    marginTop: 2,
  },
  bio: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15.5,
    lineHeight: 23,
    marginTop: 14,
    textAlign: "center",
    maxWidth: 360,
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 26,
    lineHeight: 32,
    marginTop: 6,
  },
  subtitle: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 16,
    marginTop: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  statCell: {
    alignItems: "center",
    paddingHorizontal: 30,
  },
  statValue: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 22,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 4,
  },
  followBtn: {
    marginTop: 20,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: "center",
  },
  followText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  selfNote: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 13,
    textAlign: "center",
    marginTop: 20,
  },
});
