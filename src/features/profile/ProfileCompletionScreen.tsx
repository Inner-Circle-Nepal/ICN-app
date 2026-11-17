import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { ReaderApiError, checkUsername } from "@/lib/api/readerProfile";
import { useCreateProfile } from "./useMyProfile";
import {
  normalizeDisplayName,
  validateDisplayName,
  validateUsername,
} from "./validators";

/**
 * The mandatory signup gate that fires after a Clerk OTP success for any
 * reader without a `reader_profiles` row. Collects the two fields the rest
 * of the system treats as load-bearing — a unique public username and a
 * display name that shows in Chautari and drives initials — and refuses to
 * let the reader past until both are valid.
 *
 * Bio and avatar stay optional and are edited later from `app/profile.tsx`.
 *
 * `onComplete` is called after a successful `POST /api/reader/profile/signup`.
 * The host route (PR 6: `app/profile/complete.tsx`) uses it to `router.replace`
 * into the tabs.
 */

type UsernameState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "unavailable"; message: string };

const CHECK_DEBOUNCE_MS = 450;

export function ProfileCompletionScreen({ onComplete }: { onComplete?: () => void }) {
  const { palette } = useTheme();
  const create = useCreateProfile();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [usernameState, setUsernameState] = useState<UsernameState>({ kind: "idle" });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const localUsername = useMemo(() => validateUsername(username), [username]);
  const localDisplay = useMemo(() => validateDisplayName(displayName), [displayName]);

  /*
   * Debounced availability check. Local validation runs synchronously as the
   * reader types; only once the local check passes do we hit the network.
   * The server has the final say — a value that looks fine locally may be
   * reserved in a newer build, or taken by a concurrent signup.
   *
   * All setState calls are inside the debounced setTimeout callback, not in
   * the effect body — so a fast typist that cancels mid-debounce never
   * triggers a synchronous state-in-effect render.
   */
  useEffect(() => {
    if (!localUsername.ok) return;
    const handle = username.trim();
    const timer = setTimeout(async () => {
      setUsernameState({ kind: "checking" });
      try {
        const res = await checkUsername(handle);
        if (res.available) {
          setUsernameState({ kind: "available" });
        } else {
          setUsernameState({
            kind: "unavailable",
            message:
              res.reason === "username_taken"
                ? "That username is taken."
                : res.reason === "username_reserved"
                  ? "That username is reserved."
                  : "That username can't be used.",
          });
        }
      } catch {
        // Network error: let the final submit be the authority.
        setUsernameState({ kind: "idle" });
      }
    }, CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [username, localUsername.ok]);

  // Reset the async state the moment the local validation flips off, without
  // calling setState synchronously inside the effect above.
  const displayedUsernameState: UsernameState = localUsername.ok ? usernameState : { kind: "idle" };

  const canSubmit =
    localUsername.ok &&
    localDisplay.ok &&
    displayedUsernameState.kind !== "unavailable" &&
    displayedUsernameState.kind !== "checking" &&
    !create.isPending;

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    if (!localUsername.ok || !localDisplay.ok) return;
    try {
      await create.mutateAsync({
        username: username.trim(),
        display_name: normalizeDisplayName(displayName),
      });
      onComplete?.();
    } catch (e) {
      const err = e as ReaderApiError;
      if (err.reason === "username_taken") {
        setUsernameState({ kind: "unavailable", message: "That username is taken." });
        setSubmitError("Try a different username.");
      } else if (err.reason === "profile_exists") {
        // The row was created elsewhere in the meantime. Treat as success.
        onComplete?.();
      } else {
        setSubmitError(err.message || "Something went wrong. Please try again.");
      }
    }
  }, [create, displayName, localDisplay.ok, localUsername.ok, onComplete, username]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.root, { backgroundColor: palette.paper }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.kicker, { color: palette.quiet }]}>
          Welcome to Inner Circle Nepal
        </Text>
        <Text style={[styles.title, { color: palette.ink }]}>
          One last step — set up your profile
        </Text>
        <Text style={[styles.subtitle, { color: palette.quiet }]}>
          This is how other readers will see you when you host a Chautari room
          or join a discussion. You can edit both later from Settings → Profile.
        </Text>

        {/* Display name — first because it's less of a decision. */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: palette.quiet }]}>Your name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Arun Shrestha"
            placeholderTextColor={palette.quiet}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={60}
            style={[
              styles.input,
              {
                color: palette.ink,
                borderColor: palette.rule2,
                backgroundColor: palette.paper,
              },
            ]}
          />
          <Text style={[styles.hint, { color: palette.quiet }]}>
            Shown in Chautari rooms and on your public profile.
          </Text>
          {displayName.length > 0 && !localDisplay.ok ? (
            <Text style={[styles.error, { color: palette.red }]}>
              {localDisplay.message}
            </Text>
          ) : null}
        </View>

        {/* Username */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: palette.quiet }]}>Username</Text>
          <TextInput
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase())}
            placeholder="arun_s"
            placeholderTextColor={palette.quiet}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            maxLength={30}
            style={[
              styles.input,
              {
                color: palette.ink,
                borderColor:
                  usernameState.kind === "unavailable"
                    ? palette.red
                    : palette.rule2,
                backgroundColor: palette.paper,
              },
            ]}
          />
          <Text style={[styles.hint, { color: palette.quiet }]}>
            3–30 characters: lowercase letters, numbers, underscores. This is
            your @handle and cannot be changed later.
          </Text>
          {username.length > 0 && !localUsername.ok ? (
            <Text style={[styles.error, { color: palette.red }]}>
              {localUsername.message}
            </Text>
          ) : displayedUsernameState.kind === "checking" ? (
            <Text style={[styles.hint, { color: palette.quiet }]}>Checking…</Text>
          ) : displayedUsernameState.kind === "available" ? (
            <Text style={[styles.available, { color: palette.ink2 }]}>
              @{username.trim()} is available.
            </Text>
          ) : displayedUsernameState.kind === "unavailable" ? (
            <Text style={[styles.error, { color: palette.red }]}>
              {displayedUsernameState.message}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          style={[
            styles.submit,
            {
              backgroundColor: canSubmit ? palette.ink : palette.rule2,
              borderColor: canSubmit ? palette.ink : palette.rule2,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create profile"
        >
          {create.isPending ? (
            <ActivityIndicator color={palette.paper} />
          ) : (
            <Text style={[styles.submitText, { color: palette.paper }]}>
              Create profile
            </Text>
          )}
        </Pressable>

        {submitError ? (
          <Text
            style={[styles.error, { color: palette.red }]}
            accessibilityLiveRegion="polite"
          >
            {submitError}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: spacing.gutter,
    paddingTop: 32,
    paddingBottom: 48,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 30,
    lineHeight: 36,
    marginTop: 6,
  },
  subtitle: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  field: {
    marginTop: 26,
  },
  label: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 15,
  },
  hint: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12,
    marginTop: 6,
  },
  available: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12.5,
    marginTop: 6,
  },
  error: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12.5,
    marginTop: 6,
  },
  submit: {
    marginTop: 28,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: "center",
  },
  submitText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
});
