import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useUser } from "@clerk/clerk-expo";
import * as ImagePicker from "expo-image-picker";
import Svg, { Path } from "react-native-svg";

import { isClerkConfigured } from "@/constants/config";
import { editions } from "@/constants/site";
import { subscribeToNewsletter } from "@/lib/api/newsletter";
import { profileImageDataUri } from "@/features/profile/photo";
import { useMyProfile, useUpdateMyProfile } from "@/features/profile/useMyProfile";
import {
  normalizeDisplayName,
  validateBio,
  validateDisplayName,
} from "@/features/profile/validators";
import { releasePushToken } from "@/features/profile/PushAccountLink";
import { Avatar } from "@/components/chautari/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";

/**
 * Your reader profile.
 *
 * Editable: `display_name`, `bio`, profile picture. These live in the
 * `reader_profiles` row keyed on the Clerk user id — the same row other
 * readers see on your public /user/<handle> page. Changes go through
 * `PATCH /api/reader/profile/me` on the website backend.
 *
 * Picture upload keeps using Clerk's `user.setProfileImage()` because
 * Clerk hosts the image on their CDN (no Supabase storage cost) and
 * handles resizing. The resulting URL is then mirrored into
 * `reader_profiles.avatar_url` so other readers can read it directly
 * from Supabase without a Clerk round trip.
 *
 * Read-only: `username` (the public @handle, immutable in v1 — changing
 * it would break follower links), `email` (the verified sign-in identity,
 * changing it is a verification flow and does not belong here).
 *
 * Clerk's `firstName`/`lastName` are no longer used. If an older reader
 * had them set, those values are ignored going forward — `display_name`
 * is now the authoritative name field.
 */
/**
 * Outer guard: `useAuth`/`useUser` throw outside <ClerkProvider>, which is
 * mounted only when `isClerkConfigured`. An unconfigured build would never
 * reach this route through normal navigation (there is no profile link
 * without a signed-in account), but a stray deep link or an unexpected
 * state transition could — show a graceful fallback instead of crashing.
 */
export default function ProfileScreen() {
  if (!isClerkConfigured) {
    return <ProfileUnavailable />;
  }
  return <ProfileScreenActive />;
}

function ProfileUnavailable() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: palette.paper, paddingTop: insets.top }}>
      <ErrorState
        title="Profile unavailable"
        message="This build has no account system configured."
        onRetry={() =>
          router.canGoBack() ? router.back() : router.replace("/")
        }
      />
    </View>
  );
}

function ProfileScreenActive() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { isSignedIn, isLoaded, signOut, getToken } = useAuth();
  const { user } = useUser();
  const {
    profile,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useMyProfile();
  const update = useUpdateMyProfile();

  /*
   * The fields hold a DRAFT, not a copy.
   *
   * `null` means "untouched — show whatever the server last returned."
   * Mirroring the profile into state with an effect would mean a setState
   * in an effect body (rendering twice) and would get stale against a
   * mutation elsewhere in the app. Deriving the displayed value needs no
   * effect and reconciles automatically on refetch.
   */
  const [draftDisplayName, setDraftDisplayName] = useState<string | null>(null);
  const [draftBio, setDraftBio] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const savedDisplayName = profile?.display_name ?? "";
  const savedBio = profile?.bio ?? "";
  const displayNameField = draftDisplayName ?? savedDisplayName;
  const bioField = draftBio ?? savedBio;

  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  // Heading falls back cleanly so the screen is still legible for the brief
  // pre-PR-6 window when a reader may be signed in without a profile row.
  const headingName = profile?.display_name || email?.split("@")[0] || "Reader";

  const displayCheck = validateDisplayName(displayNameField);
  const bioCheck = validateBio(bioField);
  const dirty =
    (draftDisplayName !== null && normalizeDisplayName(draftDisplayName) !== savedDisplayName) ||
    (draftBio !== null && draftBio.trim() !== savedBio);
  const canSave = dirty && displayCheck.ok && bioCheck.ok && !update.isPending;

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  }, [router]);

  const saveProfile = useCallback(async () => {
    if (!canSave) return;
    setNotice(null);
    setError(null);
    try {
      const payload: { display_name?: string; bio?: string | null } = {};
      if (draftDisplayName !== null) {
        payload.display_name = normalizeDisplayName(draftDisplayName);
      }
      if (draftBio !== null) {
        const trimmed = draftBio.trim();
        payload.bio = trimmed.length === 0 ? null : trimmed;
      }
      await update.mutateAsync(payload);
      setDraftDisplayName(null);
      setDraftBio(null);
      setNotice("Your profile has been updated.");
    } catch (e) {
      setError((e as Error).message || "Could not save your profile.");
    }
  }, [canSave, draftBio, draftDisplayName, update]);

  /**
   * Choose a new profile picture.
   *
   * Two-step: upload to Clerk's CDN via `user.setProfileImage`, then mirror
   * the resulting URL into `reader_profiles.avatar_url` so other readers can
   * read it directly from Supabase. Both steps must succeed — if the mirror
   * step fails, the picture is still on Clerk's CDN but other readers would
   * see initials until the next successful save, so surface the failure.
   *
   * The library picker needs no permission — on Android 13+ the system photo
   * picker hands back exactly the one image the reader selected and nothing
   * else, so the app never gains access to the gallery. Camera capture is
   * deliberately not offered: it would re-add the CAMERA permission that was
   * removed from this audio-only app, and a Play Store reviewer would be
   * right to ask why a newspaper wants it.
   *
   * The image is sent to Clerk as a base64 data URI. React Native has no
   * `File`, and `SetProfileImageParams` accepts a string, so this avoids
   * constructing a Blob that RN's fetch would have to round-trip.
   */
  const changePhoto = useCallback(async () => {
    if (!user || photoBusy) return;
    setNotice(null);
    setError(null);

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      /* Square, because every place it is drawn is a circle. */
      aspect: [1, 1],
      /*
       * Re-encoded at 0.7 and cropped to 512 by the picker's editor. A
       * modern phone photo is several megabytes and would be uploaded in
       * full over a Kathmandu mobile connection to be displayed at 58px.
       */
      quality: 0.7,
      base64: true,
    });

    if (picked.canceled) return;

    const file = profileImageDataUri(picked.assets?.[0]);
    if (!file) {
      setError("That image could not be read. Please try another.");
      return;
    }

    setPhotoBusy(true);
    try {
      await user.setProfileImage({ file });
      // Clerk returns the new imageUrl after reload; mirror it into our
      // reader_profiles row so other readers' queries see it immediately.
      await user.reload();
      const url = user.hasImage ? user.imageUrl : null;
      await update.mutateAsync({ avatar_url: url });
      setNotice("Your profile picture has been updated.");
    } catch (e) {
      const errs = (e as { errors?: { longMessage?: string; message?: string }[] })?.errors;
      setError(errs?.[0]?.longMessage || errs?.[0]?.message || "Could not upload that picture.");
    } finally {
      setPhotoBusy(false);
    }
  }, [user, photoBusy, update]);

  /**
   * Remove the picture. `setProfileImage({ file: null })` is Clerk's delete;
   * we follow it with a null `avatar_url` PATCH so other readers see initials
   * instead of a now-dead URL.
   */
  const removePhoto = useCallback(() => {
    if (!user || photoBusy) return;
    Alert.alert("Remove your picture?", "Your initials will be shown instead.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setPhotoBusy(true);
          setNotice(null);
          setError(null);
          void user
            .setProfileImage({ file: null })
            .then(() => update.mutateAsync({ avatar_url: null }))
            .then(() => setNotice("Your picture has been removed."))
            .catch(() => setError("Could not remove that picture."))
            .finally(() => setPhotoBusy(false));
        },
      },
    ]);
  }, [user, photoBusy, update]);

  const joinBriefing = useCallback(async () => {
    if (!email || subscribing) return;
    setSubscribing(true);
    setNotice(null);
    setError(null);
    const result = await subscribeToNewsletter({
      email,
      name: headingName,
      source: "mobile-profile",
    });
    if (result.ok) setNotice(result.message);
    else setError(result.message);
    setSubscribing(false);
  }, [email, headingName, subscribing]);

  const confirmSignOut = useCallback(() => {
    Alert.alert(
      "Sign out?",
      "You can read everything without an account. You will need to sign in again to join a Chautari conversation.",
      [
        { text: "Stay signed in", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            // This phone stops getting the reader's follow alerts first,
            // while there is still a session to prove who is asking.
            void releasePushToken(getToken)
              .then(() => signOut())
              .then(
                () => router.replace("/settings"),
                () => setError("Could not sign out. Please try again."),
              );
          },
        },
      ],
    );
  }, [signOut, getToken, router]);

  /**
   * Delete the account, which App Store guideline 5.1.1(v) requires of any app
   * that lets people create one. `user.delete()` is Clerk's own deletion; it
   * needs "Allow users to delete their accounts" left on in the Clerk dashboard.
   */
  const confirmDeleteAccount = useCallback(() => {
    if (!user) return;
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your Inner Circle Nepal account, here and on icn.news. You can still read everything without one.",
      [
        { text: "Keep my account", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            setNotice(null);
            setError(null);
            void releasePushToken(getToken)
              .then(() => user.delete())
              .then(() => signOut())
              .then(
                () => router.replace("/settings"),
                (e: unknown) => {
                  const errs = (e as { errors?: { longMessage?: string; message?: string }[] })
                    ?.errors;
                  setError(
                    errs?.[0]?.longMessage ||
                      errs?.[0]?.message ||
                      "Could not delete your account. Please try again or email newsroom@icn.news.",
                  );
                },
              );
          },
        },
      ],
    );
  }, [user, signOut, getToken, router]);

  /* ------------------------------------------------------------- gates */

  if (!isClerkConfigured) {
    return (
      <Shell onBack={back}>
        <ErrorState
          title="Accounts are unavailable"
          message="This build has no account system configured."
        />
      </Shell>
    );
  }

  if (!isLoaded || profileLoading) {
    return (
      <Shell onBack={back}>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.quiet} />
        </View>
      </Shell>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <Shell onBack={back}>
        <ErrorState
          title="You are not signed in"
          message="Reading needs no account. Sign in to join a Chautari conversation and to keep your edition between devices."
          onRetry={() => router.push("/sign-in")}
        />
      </Shell>
    );
  }

  if (!profile && profileError) {
    return (
      <Shell onBack={back}>
        <ErrorState
          title="Could not load your profile"
          message="Check your connection and try again."
          onRetry={() => void refetchProfile()}
        />
      </Shell>
    );
  }

  // Signed in with no profile row: the gate in `_layout.tsx` normally sends
  // the reader to completion first; this covers the moment before it does.
  if (!profile) {
    return (
      <Shell onBack={back}>
        <EmptyState
          kicker="Almost there"
          title="Finish setting up your profile"
          description="Choose a username and the name other readers will see."
          actionLabel="Set up profile"
          onAction={() => router.replace("/profile/complete")}
        />
      </Shell>
    );
  }

  return (
    <Shell onBack={back}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: Math.max(32, insets.bottom + 24) }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ------------------------------------------------ identity */}
          <View style={styles.identity}>
            <Pressable
              onPress={() => void changePhoto()}
              disabled={photoBusy}
              accessibilityRole="button"
              accessibilityLabel={
                user.hasImage ? "Change your profile picture" : "Add a profile picture"
              }
              accessibilityState={{ disabled: photoBusy }}
              style={({ pressed }) => [styles.photoTap, pressed && styles.pressed]}
            >
              <Avatar
                name={headingName}
                size="lg"
                /*
                 * `hasImage` distinguishes a real photograph from the
                 * placeholder Clerk generates for every account — without it
                 * the avatar would always render a remote image and the
                 * initials would never be seen. We prefer the mirrored
                 * `profile.avatar_url` because that is also what other
                 * readers see; falling back to Clerk's current `imageUrl`
                 * keeps the own-avatar fresh between upload and PATCH.
                 */
                imageUrl={profile.avatar_url ?? (user.hasImage ? user.imageUrl : null)}
              />
              {photoBusy ? (
                <View style={[styles.photoBusy, { backgroundColor: palette.paper }]}>
                  <ActivityIndicator size="small" color={palette.ink} />
                </View>
              ) : null}
            </Pressable>

            <View style={styles.identityText}>
              <Text style={[styles.name, { color: palette.ink }]} numberOfLines={2}>
                {headingName}
              </Text>
              <Text style={[styles.handle, { color: palette.quiet }]} numberOfLines={1}>
                @{profile.username}
              </Text>
              {email ? (
                <Text style={[styles.email, { color: palette.quiet }]} numberOfLines={1}>
                  {email}
                </Text>
              ) : null}
              <View style={styles.photoActions}>
                <Pressable
                  onPress={() => void changePhoto()}
                  disabled={photoBusy}
                  accessibilityRole="button"
                  accessibilityLabel={
                    user.hasImage ? "Change your profile picture" : "Add a profile picture"
                  }
                  accessibilityState={{ disabled: photoBusy }}
                  style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
                >
                  <Text style={[styles.photoBtnText, { color: palette.ink }]}>
                    {user.hasImage ? "Change picture" : "Add a picture"}
                  </Text>
                </Pressable>
                {user.hasImage ? (
                  <Pressable
                    onPress={removePhoto}
                    disabled={photoBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Remove your profile picture"
                    accessibilityState={{ disabled: photoBusy }}
                    style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
                  >
                    <Text style={[styles.photoBtnText, { color: palette.quiet }]}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          {notice ? (
            <View style={[styles.notice, { borderLeftColor: palette.rule2 }]}>
              <Text
                style={[styles.noticeText, { color: palette.quiet }]}
                accessibilityRole="alert"
              >
                {notice}
              </Text>
            </View>
          ) : null}
          {error ? (
            <View style={[styles.notice, { borderLeftColor: palette.red }]}>
              <Text style={[styles.noticeText, { color: palette.ink }]} accessibilityRole="alert">
                {error}
              </Text>
            </View>
          ) : null}

          {/* ------------------------------------------------- profile */}
          <Text style={[styles.sectionLabel, { color: palette.ink, borderBottomColor: palette.ink }]}>
            Your name
          </Text>
          <Text style={[styles.sectionHint, { color: palette.quiet }]}>
            This is what other readers see — on Chautari rooms, follower
            lists, and your public profile.
          </Text>

          <Text style={[styles.fieldLabel, { color: palette.quiet }]}>Display name</Text>
          <TextInput
            value={displayNameField}
            onChangeText={setDraftDisplayName}
            placeholder="Your name"
            placeholderTextColor={palette.quiet}
            editable={!update.isPending}
            autoCapitalize="words"
            maxLength={60}
            accessibilityLabel="Display name"
            style={[styles.input, { borderColor: palette.rule2, color: palette.ink }]}
          />
          {draftDisplayName !== null && !displayCheck.ok ? (
            <Text style={[styles.fieldError, { color: palette.red }]}>
              {displayCheck.message}
            </Text>
          ) : null}

          <Text style={[styles.fieldLabel, { color: palette.quiet }]}>Bio</Text>
          <TextInput
            value={bioField}
            onChangeText={setDraftBio}
            placeholder="A short line about you (optional)"
            placeholderTextColor={palette.quiet}
            editable={!update.isPending}
            multiline
            numberOfLines={3}
            maxLength={240}
            accessibilityLabel="Bio"
            style={[
              styles.input,
              styles.bioInput,
              { borderColor: palette.rule2, color: palette.ink },
            ]}
          />
          {draftBio !== null && !bioCheck.ok ? (
            <Text style={[styles.fieldError, { color: palette.red }]}>
              {bioCheck.message}
            </Text>
          ) : null}

          <Pressable
            onPress={() => void saveProfile()}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Save your profile"
            accessibilityState={{ disabled: !canSave }}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: canSave ? palette.ink : palette.rule2 },
              pressed && styles.pressed,
            ]}
          >
            {update.isPending ? (
              <ActivityIndicator size="small" color={palette.paper} />
            ) : (
              <Text style={[styles.primaryText, { color: palette.paper }]}>Save profile</Text>
            )}
          </Pressable>

          {/* ------------------------------------------------ username */}
          <Text style={[styles.sectionLabel, { color: palette.ink, borderBottomColor: palette.ink }]}>
            Username
          </Text>
          <Text style={[styles.sectionHint, { color: palette.quiet }]}>
            Your public @handle, used for your profile URL. Cannot be changed.
          </Text>
          <View style={[styles.readonly, { borderColor: palette.rule }]}>
            <Text style={[styles.readonlyText, { color: palette.ink2 }]} numberOfLines={1}>
              @{profile.username}
            </Text>
          </View>

          {/* ------------------------------------------------- identity */}
          <Text style={[styles.sectionLabel, { color: palette.ink, borderBottomColor: palette.ink }]}>
            Sign-in email
          </Text>
          <Text style={[styles.sectionHint, { color: palette.quiet }]}>
            {email
              ? "This is the verified address your account signs in with. Changing it needs a new verification, so it is not edited here."
              : "No email address is attached to this account."}
          </Text>
          {email ? (
            <View style={[styles.readonly, { borderColor: palette.rule }]}>
              <Text style={[styles.readonlyText, { color: palette.ink2 }]} numberOfLines={1}>
                {email}
              </Text>
              <Text style={[styles.verified, { color: palette.quiet }]}>Verified</Text>
            </View>
          ) : null}

          {/*
            The edition picker is omitted while there is only one edition —
            the same decision the website's account page makes. A radio group
            with a single option is a control that cannot be used.
          */}
          {editions.length > 1 ? (
            <>
              <Text
                style={[styles.sectionLabel, { color: palette.ink, borderBottomColor: palette.ink }]}
              >
                Your edition
              </Text>
              <Text style={[styles.sectionHint, { color: palette.quiet }]}>
                Choose where you read from and the front page will lead with that edition.
              </Text>
            </>
          ) : null}

          {/* ----------------------------------------------- briefing */}
          <Text style={[styles.sectionLabel, { color: palette.ink, borderBottomColor: palette.ink }]}>
            The briefing
          </Text>
          <Text style={[styles.sectionHint, { color: palette.quiet }]}>
            One email each weekday morning, Kathmandu time. We send a confirmation first, and every
            briefing carries a one-tap unsubscribe link.
          </Text>
          <Pressable
            onPress={() => void joinBriefing()}
            disabled={!email || subscribing}
            accessibilityRole="button"
            accessibilityLabel="Email me the weekday briefing"
            accessibilityState={{ disabled: !email || subscribing }}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: palette.ink },
              pressed && styles.pressed,
            ]}
          >
            {subscribing ? (
              <ActivityIndicator size="small" color={palette.ink} />
            ) : (
              <Text style={[styles.secondaryText, { color: palette.ink }]}>
                Email me the briefing
              </Text>
            )}
          </Pressable>

          {/* ------------------------------------------------- account */}
          <Text style={[styles.sectionLabel, { color: palette.ink, borderBottomColor: palette.ink }]}>
            Account
          </Text>
          <Pressable
            onPress={confirmSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign out of your account"
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: palette.rule2 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.secondaryText, { color: palette.red }]}>Sign out</Text>
          </Pressable>

          <Text style={[styles.legal, { color: palette.quiet }]}>
            Reading Inner Circle Nepal never needs an account. Signing out leaves the front page,
            search and your saved stories exactly as they are on this device.
          </Text>

          <Pressable
            onPress={confirmDeleteAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete your account permanently"
            style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
          >
            <Text style={[styles.photoBtnText, { color: palette.red }]}>Delete account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Shell>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
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
        </Pressable>
        <Text style={[styles.topTitle, { color: palette.ink }]} accessibilityRole="header">
          Profile
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    height: 48,
    paddingHorizontal: spacing.gutter,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
  },
  backBtn: { minHeight: 44, minWidth: 32, justifyContent: "center" },
  topTitle: { fontFamily: fontFamilies.serifMedium, fontSize: 17, letterSpacing: -0.2 },
  body: { paddingHorizontal: spacing.gutter, paddingTop: 22 },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  photoTap: { minHeight: 58, minWidth: 58, alignItems: "center", justifyContent: "center" },
  photoBusy: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.78,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
  },
  photoActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 6 },
  photoBtn: { minHeight: 44, justifyContent: "center" },
  photoBtnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  identityText: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.5,
  },
  handle: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 13,
    marginTop: 2,
  },
  email: { fontFamily: fontFamilies.sansRegular, fontSize: 12.5, marginTop: 4 },
  notice: { borderLeftWidth: 2, paddingLeft: 10, marginTop: 18 },
  noticeText: { fontFamily: fontFamilies.sansRegular, fontSize: 12.5, lineHeight: 18 },
  sectionLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginTop: 34,
  },
  sectionHint: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 10,
  },
  fieldLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 18,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
    marginTop: 7,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 16,
  },
  bioInput: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  fieldError: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12.5,
    marginTop: 6,
  },
  readonly: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  readonlyText: { fontFamily: fontFamilies.sansRegular, fontSize: 14, flexShrink: 1 },
  verified: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  primary: {
    marginTop: 20,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  secondary: {
    marginTop: 16,
    minHeight: 48,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  legal: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 26,
  },
  loading: { paddingVertical: 48, alignItems: "center" },
  pressed: { opacity: 0.75 },
});
