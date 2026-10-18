import React, { useState } from "react";
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
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import Svg, { Path } from "react-native-svg";

import { ChautariError, openRoom } from "@/lib/api/chautari";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";

/**
 * Open a room.
 *
 * The server decides whether this account may host — `chautari_host_entitlements`
 * is the gate, and a reader without one gets a plain refusal rather than a
 * disabled button they cannot explain. That is deliberate: the entitlement
 * can be granted while this screen is open, and the client has no business
 * caching a permission.
 */
export default function NewRoomScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/chautari");
  };

  const submit = async () => {
    const clean = title.trim();
    if (clean.length < 3) {
      setError("Give the conversation a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const room = await openRoom(getToken, {
        title: clean,
        description: description.trim() || undefined,
        hostName: user?.fullName?.trim() || user?.firstName?.trim() || null,
      });
      // Replace, not push: backing out of a live room should not land the
      // host on the form that created it.
      router.replace(`/chautari/${encodeURIComponent(room.slug)}`);
    } catch (e) {
      setError(
        e instanceof ChautariError ? e.message : "Could not open the room. Please try again.",
      );
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: palette.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.topBar, { borderBottomColor: palette.rule }]}>
        <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backBtn}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M19 12H5M11 6l-6 6 6 6" stroke={palette.ink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={[styles.backLabel, { color: palette.ink }]}>Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.kicker, { color: palette.quiet }]}>Host a conversation</Text>
        <Text style={[styles.title, { color: palette.ink }]}>Open a Chautari</Text>
        <Text style={[styles.sub, { color: palette.quiet }]}>
          You go on air as soon as the room opens. Listeners can raise a hand;
          you decide who speaks.
        </Text>

        <Text style={[styles.label, { color: palette.ink }]}>Title</Text>
        <TextInput
          value={title}
          onChangeText={(v) => setTitle(v.slice(0, 140))}
          placeholder="What is this conversation about?"
          placeholderTextColor={palette.quiet}
          editable={!busy}
          accessibilityLabel="Room title"
          style={[styles.input, { borderColor: palette.rule2, color: palette.ink }]}
        />

        <Text style={[styles.label, { color: palette.ink }]}>Description (optional)</Text>
        <TextInput
          value={description}
          onChangeText={(v) => setDescription(v.slice(0, 500))}
          placeholder="A sentence for the schedule."
          placeholderTextColor={palette.quiet}
          editable={!busy}
          multiline
          accessibilityLabel="Room description"
          style={[styles.input, styles.multiline, { borderColor: palette.rule2, color: palette.ink }]}
        />

        {error ? (
          <Text style={[styles.error, { color: palette.red }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={() => void submit()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: busy ? palette.rule2 : palette.ink },
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={palette.paper} />
          ) : (
            <Text style={[styles.primaryText, { color: palette.paper }]}>Go on air</Text>
          )}
        </Pressable>

        <Text style={[styles.legal, { color: palette.quiet }]}>
          Hosting is granted by the newsroom. If your account is not yet
          approved you will be told here, and nothing is charged.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
  body: { paddingHorizontal: spacing.gutter, paddingTop: 26, paddingBottom: 40 },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.5,
    marginTop: 8,
  },
  sub: { fontFamily: fontFamilies.serifLight, fontSize: 16, lineHeight: 24, marginTop: 10 },
  label: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    marginTop: 24,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16,
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  error: { fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 19, marginTop: 14 },
  primary: { marginTop: 24, minHeight: 48, alignItems: "center", justifyContent: "center" },
  primaryText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  legal: { fontFamily: fontFamilies.sansRegular, fontSize: 11.5, lineHeight: 17, marginTop: 26 },
  pressed: { opacity: 0.8 },
});
