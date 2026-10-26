import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@clerk/clerk-expo";
import Svg, { Circle, Path } from "react-native-svg";

import { isClerkConfigured } from "@/constants/config";
import {
  buildRequirements,
  eligibilitySummary,
  isAccountVerified,
  type MetricState,
  type Requirement,
  type RequirementId,
} from "@/features/chautari/eligibility";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import type { ThemePalette } from "@/theme/tokens";

/**
 * Earning on Chautari — what the programme asks for.
 *
 * ## Why this is a screen and not a band on the feed
 *
 * The Chautari landing page is a schedule. Its job is to show what is on air
 * and get a reader into a room; four requirement cards above that would push
 * the live rooms below the fold to serve the small minority who host. So the
 * programme lives here and the feed carries one quiet line pointing at it.
 *
 * ## What this screen can honestly tell you
 *
 * One of the four requirements has data behind it. Verification comes from
 * Clerk, which reports a status per email address and phone number. The other
 * three have no source of truth in this product:
 *
 *   - followers      there is no follower system anywhere in the schema
 *   - hosting minutes `chautari_rooms` carries `started_at`/`ended_at`, so the
 *                     raw material exists, but nothing aggregates it per host
 *   - approval        no application table, no endpoint, no flow
 *
 * Those render as "Not tracked yet" rather than as a bar at zero. A zeroed
 * progress bar would tell a host they have no followers, when the truth is
 * that nobody is counting — see features/chautari/eligibility.ts.
 *
 * There is deliberately no Apply button. Applications do not exist yet, and a
 * button that acknowledges a tap and does nothing is worse than its absence.
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

  const summary = eligibilitySummary(requirements);

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
        </Pressable>
        <Text style={[styles.topTitle, { color: palette.ink }]} accessibilityRole="header">
          Earn on Chautari
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: Math.max(32, insets.bottom + 24) },
        ]}
      >
        <Text style={[styles.kicker, { color: palette.quiet }]}>Creator monetization</Text>
        <Text style={[styles.title, { color: palette.ink }]}>
          Four things before you can earn
        </Text>
        <Text style={[styles.standfirst, { color: palette.quiet }]}>
          Chautari is where the newsroom and its readers talk out loud. Hosts who build an
          audience and keep rooms running can apply to earn from them. Here is what the
          programme asks for.
        </Text>

        {/*
          The summary speaks only to what is tracked. Saying "1 of 4" would
          imply the other three are measured and failed.
        */}
        <View style={[styles.summary, { borderColor: palette.rule2 }]}>
          <Text style={[styles.summaryText, { color: palette.quiet }]}>
            {summary.tracked === 0
              ? "None of these are tracked in the app yet."
              : `${summary.met} of ${summary.tracked} tracked ${
                  summary.tracked === 1 ? "requirement" : "requirements"
                } met. The rest are not measured in the app yet.`}
          </Text>
        </View>

        {requirements.map((req, i) => (
          <RequirementRow key={req.id} requirement={req} index={i + 1} />
        ))}

        {/* No Apply button: the flow does not exist. Say so plainly. */}
        <View style={[styles.applyNote, { borderColor: palette.rule2 }]}>
          <Text style={[styles.applyTitle, { color: palette.ink }]}>
            Applications are not open yet
          </Text>
          <Text style={[styles.applyBody, { color: palette.quiet }]}>
            When the programme opens, eligible hosts will be able to apply from this screen.
            Nothing is collected from you today — no payout details, and no terms to accept.
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

function RequirementRow({ requirement, index }: { requirement: Requirement; index: number }) {
  const { palette } = useTheme();
  const { state } = requirement;

  return (
    <View
      style={[styles.req, { borderTopColor: palette.rule }]}
      accessible
      accessibilityLabel={`Requirement ${index}. ${requirement.title}. ${stateLabel(state)}. ${requirement.body}`}
    >
      <View style={styles.reqHead}>
        <View style={[styles.icon, { borderColor: palette.rule2 }]}>
          <RequirementIcon id={requirement.id} palette={palette} />
        </View>
        <View style={styles.reqHeadText}>
          <Text style={[styles.reqTitle, { color: palette.ink }]}>{requirement.title}</Text>
          <StatusPill state={state} />
        </View>
      </View>

      <Text style={[styles.reqBody, { color: palette.quiet }]}>{requirement.body}</Text>

      {/*
        A bar is drawn ONLY for a real count. `unavailable` gets the line
        below instead, so an untracked metric can never be mistaken for zero.
      */}
      {state.kind === "progress" ? (
        <ProgressBar current={state.current} target={state.target} />
      ) : null}
      {state.kind === "unavailable" ? (
        <Text style={[styles.untracked, { color: palette.quiet }]}>
          Not tracked in the app yet.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Status is words first — never colour alone.
 *
 * A met requirement is set in `ink`, not red. The house rules reserve the one
 * red for the wordmark and for live/breaking markers; a completed step is
 * neither, and on screen a red "DONE" reads as a warning rather than an
 * achievement.
 */
function StatusPill({ state }: { state: MetricState }) {
  const { palette } = useTheme();
  const met = state.kind === "met";
  return (
    <View
      style={[
        styles.pill,
        { borderColor: met ? palette.ink : palette.rule2 },
        met && { backgroundColor: palette.ink },
      ]}
    >
      <Text style={[styles.pillText, { color: met ? palette.paper : palette.quiet }]}>
        {stateLabel(state)}
      </Text>
    </View>
  );
}

function stateLabel(state: MetricState): string {
  switch (state.kind) {
    case "met":
      return "Done";
    case "unmet":
      return "Not yet";
    case "progress":
      return `${state.current.toLocaleString()} of ${state.target.toLocaleString()}`;
    case "unavailable":
      return "Not tracked";
  }
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const { palette } = useTheme();
  const pct = Math.max(0, Math.min(1, target > 0 ? current / target : 0));
  return (
    <View
      style={[styles.track, { backgroundColor: palette.rule }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: target, now: current }}
    >
      <View style={[styles.fill, { backgroundColor: palette.ink, width: `${pct * 100}%` }]} />
    </View>
  );
}

function RequirementIcon({ id, palette }: { id: RequirementId; palette: ThemePalette }) {
  const stroke = palette.ink;
  const p = { stroke, strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "verified":
      /* A tick inside a ring. */
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M8.5 12.2l2.4 2.4 4.6-4.9" {...p} />
        </Svg>
      );
    case "followers":
      /* Two figures. */
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Circle cx={9} cy={8} r={3.2} {...p} />
          <Path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" {...p} />
          <Path d="M16 6.4a3.2 3.2 0 0 1 0 6M17.5 14.4c2 .6 3.5 2.3 3.5 4.6" {...p} />
        </Svg>
      );
    case "hosting":
      /* A clock. */
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M12 7v5.3l3.3 2" {...p} />
        </Svg>
      );
    case "approval":
      /* A document with a tick. */
      return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5z" {...p} />
          <Path d="M13.5 3.6V8h4.4M9 14.2l2 2 4-4.2" {...p} />
        </Svg>
      );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  summary: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginTop: 20 },
  summaryText: { fontFamily: fontFamilies.sansRegular, fontSize: 12, lineHeight: 18 },
  req: { borderTopWidth: 1, paddingTop: 18, marginTop: 24 },
  reqHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  icon: {
    width: 40,
    height: 40,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  reqHeadText: { flex: 1, minWidth: 0, gap: 6 },
  reqTitle: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  pill: { alignSelf: "flex-start", borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  pillText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  reqBody: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 10,
  },
  track: { height: 3, marginTop: 12, overflow: "hidden" },
  fill: { height: 3 },
  untracked: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    fontStyle: "italic",
    marginTop: 10,
  },
  applyNote: { borderWidth: 1, padding: 14, marginTop: 30 },
  applyTitle: { fontFamily: fontFamilies.serifMedium, fontSize: 16 },
  applyBody: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 7,
  },
  legal: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 24,
  },
});
