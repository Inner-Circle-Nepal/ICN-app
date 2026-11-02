import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@clerk/clerk-expo";
import Svg, { Path } from "react-native-svg";

import { isClerkConfigured } from "@/constants/config";
import {
  buildRequirements,
  isAccountVerified,
  type MetricState,
  type Requirement,
} from "@/features/chautari/eligibility";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing, type ThemePalette } from "@/theme/tokens";

/**
 * Earning on Chautari — Direction B ("The dispatch").
 *
 * Rendered as a programme bulletin: a REQUIREMENT / STATUS table where the one
 * honestly-tracked requirement (Clerk verification) shows "VERIFIED" and the
 * other three say "NOT TRACKED YET" plainly. A notice at the bottom explains
 * what "not tracked" means — the programme is not yet open, and no absence
 * here reflects on the host.
 *
 * Deliberately no Apply button. Applications do not exist yet; a button that
 * acknowledges a tap and does nothing is worse than its absence.
 */
export default function EarnOnChautariScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useUser();

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/chautari");
  };

  /*
   * Verification is read from the live Clerk resource, never assumed. A
   * signed-out reader gets `false`, which is the honest answer — not an
   * optimistic one.
   */
  const verified =
    isClerkConfigured && isLoaded && user
      ? isAccountVerified({ emails: user.emailAddresses, phones: user.phoneNumbers })
      : false;

  const requirements = buildRequirements({
    verified,
    /*
     * Explicitly undefined. These are `[needs API]`: passing 0 would be
     * indistinguishable from a real zero and would read as a factual claim
     * about this host's audience.
     */
    followers: undefined,
    hostingMinutes: undefined,
    applicationStatus: undefined,
  });

  return (
    <View style={[styles.screen, { backgroundColor: palette.paper }]}>
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

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: Math.max(32, insets.bottom + 24) },
        ]}
      >
        <Text style={[styles.kicker, { color: palette.quiet }]}>Programme bulletin</Text>
        <Text style={[styles.title, { color: palette.ink }]}>Earn on Chautari</Text>
        <Text style={[styles.standfirst, { color: palette.quiet }]}>
          What the programme asks of hosts, and what we can show you today.
        </Text>

        {/* Table header — the two columns the requirement rows will fill. */}
        <View
          style={[
            styles.tableHeader,
            { borderTopColor: palette.ink, borderBottomColor: palette.rule },
          ]}
        >
          <Text style={[styles.colHeadRequirement, { color: palette.quiet }]}>Requirement</Text>
          <Text style={[styles.colHeadStatus, { color: palette.quiet }]}>Status</Text>
        </View>

        {requirements.map((req) => (
          <RequirementRow key={req.id} requirement={req} palette={palette} />
        ))}

        {/* NOTICE — plain-spoken explanation of what "not tracked" means. */}
        <View style={styles.noticeBlock}>
          <Text style={[styles.noticeLabel, { color: palette.quiet }]}>Notice</Text>
          <Text style={[styles.noticeBody, { color: palette.ink2 }]}>
            Applications are not open yet. &ldquo;Not tracked yet&rdquo; means we don&apos;t count
            it &mdash; not that you&apos;ve fallen short.
          </Text>
        </View>

        <Text style={[styles.legal, { color: palette.quiet }]}>
          Meeting these requirements makes a host eligible to apply. It does not guarantee
          approval or earnings. Eligibility, approval and payment are subject to Inner Circle
          Nepal&rsquo;s programme terms, which may change.
        </Text>
      </ScrollView>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One row of the REQUIREMENT / STATUS table.
 *
 * The row is title + status chip on top, body below. No icons, no progress
 * bars — the table layout carries the hierarchy on its own, and a zeroed
 * bar would be dishonest where nothing is being measured.
 */
function RequirementRow({
  requirement,
  palette,
}: {
  requirement: Requirement;
  palette: ThemePalette;
}) {
  const { state } = requirement;

  return (
    <View
      style={[styles.req, { borderBottomColor: palette.rule }]}
      accessible
      accessibilityLabel={`${requirement.title}. ${stateLabel(state)}. ${requirement.body}`}
    >
      <View style={styles.reqRow}>
        <Text style={[styles.reqTitle, { color: palette.ink }]}>{requirement.title}</Text>
        <StatusChip state={state} palette={palette} />
      </View>
      <Text style={[styles.reqBody, { color: palette.quiet }]}>{requirement.body}</Text>
    </View>
  );
}

/**
 * Status is words first — never colour alone.
 *
 * A met requirement is set in `ink`, not red. The house rules reserve the one
 * red for the wordmark and for live/breaking markers; a completed step is
 * neither, and on screen a red "VERIFIED" reads as a warning rather than an
 * achievement.
 */
function StatusChip({ state, palette }: { state: MetricState; palette: ThemePalette }) {
  const met = state.kind === "met";
  const unavailable = state.kind === "unavailable";
  return (
    <View style={styles.statusWrap}>
      {met ? <TickGlyph color={palette.ink} /> : null}
      <Text
        style={[
          styles.statusText,
          { color: met ? palette.ink : unavailable ? palette.quiet : palette.ink2 },
        ]}
      >
        {chipLabel(state)}
      </Text>
    </View>
  );
}

function TickGlyph({ color }: { color: string }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12l5 5 9-11"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function chipLabel(state: MetricState): string {
  switch (state.kind) {
    case "met":
      return "Verified";
    case "unmet":
      return "Not yet";
    case "progress":
      return `${state.current.toLocaleString()} / ${state.target.toLocaleString()}`;
    case "unavailable":
      return "Not tracked yet";
  }
}

function stateLabel(state: MetricState): string {
  switch (state.kind) {
    case "met":
      return "Verified";
    case "unmet":
      return "Not yet";
    case "progress":
      return `${state.current.toLocaleString()} of ${state.target.toLocaleString()}`;
    case "unavailable":
      return "Not tracked yet";
  }
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

  body: { paddingHorizontal: spacing.gutter, paddingTop: 22 },

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
    letterSpacing: -0.6,
    marginTop: 7,
  },
  standfirst: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15.5,
    lineHeight: 23,
    marginTop: 10,
  },

  tableHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 28,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  colHeadRequirement: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  colHeadStatus: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },

  req: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  reqRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  reqTitle: {
    flex: 1,
    fontFamily: fontFamilies.serifMedium,
    fontSize: 16.5,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 3,
  },
  statusText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  reqBody: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    paddingRight: 12,
  },

  noticeBlock: {
    marginTop: 28,
  },
  noticeLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  noticeBody: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },

  legal: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 28,
  },
});
