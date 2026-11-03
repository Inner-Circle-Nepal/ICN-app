import React, { useMemo, useState } from "react";
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
import { isClerkConfigured } from "@/constants/config";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing, type ThemePalette } from "@/theme/tokens";
import { ErrorState } from "@/components/ErrorState";

const MAX_HEADLINE = 140;
const MAX_STANDFIRST = 500;

/**
 * Open a room — Direction B ("The dispatch").
 *
 * Rendered as a story-file sheet: a chyron up top ("NEW ROOM · NOT YET ON AIR"),
 * byline (FILED BY) and DATELINE above the inputs, HEADLINE and STANDFIRST
 * replacing the Clubhouse "title/description" wording. The POST payload is
 * unchanged — this is purely presentational.
 *
 * The server decides whether this account may host. Entitlement is checked
 * server-side when the form submits; a reader without one gets a plain refusal
 * rather than a disabled button they cannot explain.
 */
/**
 * Outer guard: `useAuth`/`useUser` throw outside <ClerkProvider>, and the
 * provider mounts only when `isClerkConfigured`. Keep the hooks inside the
 * inner component that is only ever mounted in configured builds; otherwise
 * an unconfigured APK crashes the moment this screen opens.
 */
export default function NewRoomScreen() {
  if (!isClerkConfigured) {
    return <NewRoomUnavailable />;
  }
  return <NewRoomScreenActive />;
}

function NewRoomUnavailable() {
  const router = useRouter();
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.paper }}>
      <View style={[styles.topBar, { borderBottomColor: palette.rule }]}>
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/chautari")
          }
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
          <Text style={[styles.backLabel, { color: palette.ink }]}>Back</Text>
        </Pressable>
      </View>
      <ErrorState
        title="Hosting is unavailable"
        message="This build has no account system configured, so a Chautari room cannot be opened from here."
      />
    </View>
  );
}

function NewRoomScreenActive() {
  const router = useRouter();
  const { palette } = useTheme();
  const { getToken } = useAuth();
  const { user } = useUser();

  const [headline, setHeadline] = useState("");
  const [standfirst, setStandfirst] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The dateline is captured ONCE on mount. A byline doesn't tick — the time
   * printed is when the room was filed, not when the form is being read.
   */
  const dateline = useMemo(() => formatDateline(new Date()), []);
  const filedBy =
    user?.fullName?.trim() ||
    user?.firstName?.trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    "You";

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/chautari");
  };

  const submit = async () => {
    const clean = headline.trim();
    if (clean.length < 3) {
      setError("Give the conversation a headline.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const room = await openRoom(getToken, {
        title: clean,
        description: standfirst.trim() || undefined,
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
        <Pressable
          onPress={back}
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
          <Text style={[styles.backLabel, { color: palette.ink }]}>Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Chyron left="NEW ROOM · NOT YET ON AIR" right="Draft" palette={palette} />

        <Text style={[styles.kicker, { color: palette.quiet }]}>Host a conversation</Text>
        <Text style={[styles.title, { color: palette.ink }]}>Open a Chautari</Text>
        <Text style={[styles.sub, { color: palette.quiet }]}>
          File the room like you&apos;d file a story: what it&apos;s about, and who should tune in.
        </Text>

        <View
          style={[
            styles.bylineBlock,
            { borderTopColor: palette.rule, borderBottomColor: palette.rule },
          ]}
        >
          <MetaRow label="FILED BY" value={filedBy} palette={palette} />
          <View style={[styles.bylineDivider, { backgroundColor: palette.rule }]} />
          <MetaRow label="DATELINE" value={dateline} palette={palette} />
        </View>

        <LabelRow
          label="HEADLINE"
          counter={`${headline.length} / ${MAX_HEADLINE}`}
          palette={palette}
        />
        <TextInput
          value={headline}
          onChangeText={(v) => setHeadline(v.slice(0, MAX_HEADLINE))}
          placeholder="Who pays for the new federal budget?"
          placeholderTextColor={palette.quiet}
          editable={!busy}
          accessibilityLabel="Room headline"
          style={[styles.input, { borderColor: palette.rule2, color: palette.ink }]}
        />

        <LabelRow
          label="STANDFIRST · OPTIONAL"
          counter={`${standfirst.length} / ${MAX_STANDFIRST}`}
          palette={palette}
        />
        <TextInput
          value={standfirst}
          onChangeText={(v) => setStandfirst(v.slice(0, MAX_STANDFIRST))}
          placeholder="Who will be on stage, and what you want to ask them."
          placeholderTextColor={palette.quiet}
          editable={!busy}
          multiline
          accessibilityLabel="Room standfirst"
          style={[
            styles.input,
            styles.multiline,
            { borderColor: palette.rule2, color: palette.ink },
          ]}
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
            <Text style={[styles.primaryText, { color: palette.paper }]}>Open the room</Text>
          )}
        </Pressable>

        <Text style={[styles.legal, { color: palette.quiet }]}>
          Hosting is granted by the newsroom. If your account is not yet approved you will be told
          here, and nothing is charged.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * The Direction B chyron — a solid black bar across full width with white
 * caps text, like a breaking-news ticker. Used at the top of forms and the
 * live room header. The left label carries the status; the right label
 * carries a short qualifier.
 */
function Chyron({
  left,
  right,
  palette,
}: {
  left: string;
  right?: string;
  palette: ThemePalette;
}) {
  return (
    <View style={[styles.chyron, { backgroundColor: palette.ink }]}>
      <Text style={[styles.chyronLeft, { color: palette.paper }]} numberOfLines={1}>
        {left}
      </Text>
      {right ? (
        <Text style={[styles.chyronRight, { color: palette.paper }]} numberOfLines={1}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

/** Byline / Dateline row: caps label on the left, value filled on the right. */
function MetaRow({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: ThemePalette;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: palette.quiet }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: palette.ink }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** Input label + character counter on the same row. */
function LabelRow({
  label,
  counter,
  palette,
}: {
  label: string;
  counter: string;
  palette: ThemePalette;
}) {
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color: palette.quiet }]}>{label}</Text>
      <Text style={[styles.counter, { color: palette.quiet }]}>{counter}</Text>
    </View>
  );
}

/**
 * "Kathmandu · Sat 31 Oct · 17:42 NPT".
 *
 * Dateline is always Kathmandu time — the paper is based there and the Nepal
 * audience reads NPT regardless of where the diaspora reader is.
 */
function formatDateline(d: Date): string {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kathmandu", ...opts }).format(d);
  const weekday = fmt({ weekday: "short" });
  const day = fmt({ day: "numeric" });
  const month = fmt({ month: "short" });
  const time = fmt({ hour: "2-digit", minute: "2-digit", hour12: false });
  return `Kathmandu · ${weekday} ${day} ${month} · ${time} NPT`;
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
  body: { paddingHorizontal: spacing.gutter, paddingTop: 18, paddingBottom: 40 },

  chyron: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 22,
    gap: 12,
  },
  chyronLeft: {
    flex: 1,
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
  },
  chyronRight: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 10,
    letterSpacing: 0.6,
  },

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

  bylineBlock: {
    marginTop: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  bylineDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 4,
  },
  metaLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    width: 92,
    paddingTop: 3,
  },
  metaValue: {
    flex: 1,
    fontFamily: fontFamilies.serifMedium,
    fontSize: 15,
    lineHeight: 21,
  },

  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 22,
    marginBottom: 8,
  },
  label: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  counter: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 10.5,
    letterSpacing: 0.6,
  },

  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontFamily: fontFamilies.serifRegular,
    fontSize: 16,
  },
  multiline: { minHeight: 92, textAlignVertical: "top" },

  error: { fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 19, marginTop: 14 },

  primary: {
    marginTop: 28,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },

  legal: { fontFamily: fontFamilies.sansRegular, fontSize: 11.5, lineHeight: 17, marginTop: 26 },
  pressed: { opacity: 0.8 },
});
