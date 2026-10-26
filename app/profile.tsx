import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { Avatar } from "@/components/chautari/Avatar";
import { ErrorState } from "@/components/ErrorState";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";

/**
 * Your reader account.
 *
 * ## What a reader account actually is here
 *
 * Very little, deliberately. Reading is free and needs no account; what an
 * account buys is a Chautari microphone, an edition that follows you between
 * devices, and the weekday briefing. So this screen edits the small number of
 * things that genuinely exist rather than inventing a social profile.
 *
 * ## Why there is no profile photograph
 *
 * There is nowhere to put one. No Chautari payload carries an avatar URL,
 * `chautari_participants` has no column for it, and the only `avatar_url` in
 * the schema belongs to `authors` — journalists' bylines, not readers.
 * Uploading to Clerk's own storage would work today and then die at the
 * authentication cutover, leaving every reader's picture at a dead
 * `img.clerk.com` URL. Pictures are deferred to the auth migration, where
 * they get a table and a bucket we own. Initials until then — see
 * `components/chautari/Avatar.tsx`.
 *
 * ## What is editable, and by whom
 *
 * The name goes through Clerk's client SDK, which is allowed to change it.
 * The email is shown and NOT editable: it is the verified identity the
 * Chautari endpoints authorise against, and changing it is a verification
 * flow rather than a text field.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { isSignedIn, isLoaded, signOut } = useAuth();
  const { user } = useUser();

  /*
   * The fields hold a DRAFT, not a copy.
   *
   * `null` means "untouched — show whatever Clerk currently has". Mirroring
   * the user resource into state with an effect would mean a `setState` in
   * an effect body, which cascades a second render on every arrival of the
   * user object; deriving it needs no effect and cannot go stale, because
   * Clerk remains the source until the reader actually types.
   */
  const [draftFirst, setDraftFirst] = useState<string | null>(null);
  const [draftLast, setDraftLast] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const savedFirst = user?.firstName ?? "";
  const savedLast = user?.lastName ?? "";
  const firstName = draftFirst ?? savedFirst;
  const lastName = draftLast ?? savedLast;

  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const displayName =
    user?.fullName?.trim() || user?.firstName?.trim() || email?.split("@")[0] || "Reader";

  const dirty = firstName.trim() !== savedFirst || lastName.trim() !== savedLast;

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  }, [router]);

  const saveName = useCallback(async () => {
    if (!user || savingName) return;
    setSavingName(true);
    setNotice(null);
    setError(null);
    try {
      await user.update({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      });
      /* Hand the fields back to Clerk's value now that it is authoritative. */
      setDraftFirst(null);
      setDraftLast(null);
      setNotice("Your name has been updated.");
    } catch (e) {
      /* Clerk's errors are structured; show the first, never a stack. */
      const errs = (e as { errors?: { longMessage?: string; message?: string }[] })?.errors;
      setError(errs?.[0]?.longMessage || errs?.[0]?.message || "Could not save your name.");
    } finally {
      setSavingName(false);
    }
  }, [user, savingName, firstName, lastName]);

  /**
   * Choose a new profile picture.
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
      setNotice("Your profile picture has been updated.");
    } catch (e) {
      const errs = (e as { errors?: { longMessage?: string; message?: string }[] })?.errors;
      setError(errs?.[0]?.longMessage || errs?.[0]?.message || "Could not upload that picture.");
    } finally {
      setPhotoBusy(false);
    }
  }, [user, photoBusy]);

  /** Remove it. `setProfileImage({ file: null })` is Clerk's delete. */
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
            .then(() => setNotice("Your picture has been removed."))
            .catch(() => setError("Could not remove that picture."))
            .finally(() => setPhotoBusy(false));
        },
      },
    ]);
  }, [user, photoBusy]);

  const joinBriefing = useCallback(async () => {
    if (!email || subscribing) return;
    setSubscribing(true);
    setNotice(null);
    setError(null);
    const result = await subscribeToNewsletter({
      email,
      name: displayName,
      source: "mobile-profile",
    });
    if (result.ok) setNotice(result.message);
    else setError(result.message);
    setSubscribing(false);
  }, [email, displayName, subscribing]);

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
            void signOut().then(
              () => router.replace("/settings"),
              () => setError("Could not sign out. Please try again."),
            );
          },
        },
      ],
    );
  }, [signOut, router]);

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

  if (!isLoaded) {
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

  return (
    <Shell onBack={back}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
                name={displayName}
                size="lg"
                /*
                 * `hasImage` distinguishes a real photograph from the
                 * placeholder Clerk generates for every account — without it
                 * the avatar would always render a remote image and the
                 * initials would never be seen.
                 */
                imageUrl={user.hasImage ? user.imageUrl : null}
              />
              {photoBusy ? (
                <View style={[styles.photoBusy, { backgroundColor: palette.paper }]}>
                  <ActivityIndicator size="small" color={palette.ink} />
                </View>
              ) : null}
            </Pressable>

            <View style={styles.identityText}>
              <Text style={[styles.name, { color: palette.ink }]} numberOfLines={2}>
                {displayName}
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

          {/* ---------------------------------------------------- name */}
          <Text style={[styles.sectionLabel, { color: palette.ink, borderBottomColor: palette.ink }]}>
            Your name
          </Text>
          <Text style={[styles.sectionHint, { color: palette.quiet }]}>
            This is what other people see when you speak in a Chautari room.
          </Text>

          <Text style={[styles.fieldLabel, { color: palette.quiet }]}>First name</Text>
          <TextInput
            value={firstName}
            onChangeText={setDraftFirst}
            placeholder="First name"
            placeholderTextColor={palette.quiet}
            editable={!savingName}
            autoCapitalize="words"
            autoComplete="given-name"
            accessibilityLabel="First name"
            style={[styles.input, { borderColor: palette.rule2, color: palette.ink }]}
          />

          <Text style={[styles.fieldLabel, { color: palette.quiet }]}>Last name</Text>
          <TextInput
            value={lastName}
            onChangeText={setDraftLast}
            placeholder="Last name"
            placeholderTextColor={palette.quiet}
            editable={!savingName}
            autoCapitalize="words"
            autoComplete="family-name"
            accessibilityLabel="Last name"
            style={[styles.input, { borderColor: palette.rule2, color: palette.ink }]}
          />

          <Pressable
            onPress={() => void saveName()}
            disabled={!dirty || savingName}
            accessibilityRole="button"
            accessibilityLabel="Save your name"
            accessibilityState={{ disabled: !dirty || savingName }}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: !dirty || savingName ? palette.rule2 : palette.ink },
              pressed && styles.pressed,
            ]}
          >
            {savingName ? (
              <ActivityIndicator size="small" color={palette.paper} />
            ) : (
              <Text style={[styles.primaryText, { color: palette.paper }]}>Save name</Text>
            )}
          </Pressable>

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
