import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorMessage } from "@/components/ErrorMessage";
import { useTheme } from "@/hooks/useTheme";
import {
  ChautariError,
  askToJoin,
  getJoinRequestState,
  type JoinRequestState,
} from "@/lib/api/chautari";
import { fontFamilies, spacing } from "@/theme/tokens";
import { LockIcon } from "./RoomIcons";

/** How often a waiting reader's app checks whether they've been let in. */
const CHECK_EVERY_MS = 4000;

/**
 * Shown when an invite-only room turns the reader away: ask the host to be
 * let in, then wait on this screen. The app checks every few seconds; once
 * the host (or a moderator) says yes, or the room is unlocked, `onAdmitted`
 * joins. A "no" says so, and asking again is possible after a short wait
 * (the server enforces it). Same layout as EmptyState, so it sits where the
 * other refusals do.
 */
export function AskToJoin({ slug, onAdmitted }: { slug: string; onAdmitted: () => void }) {
  const { palette } = useTheme();
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = ["joinRequestState", slug] as const;
  const state = useQuery({
    queryKey: key,
    queryFn: () => getJoinRequestState(getToken, slug),
    // Only while waiting; otherwise checked once, in case they asked before.
    refetchInterval: (q) => (q.state.data === "pending" ? CHECK_EVERY_MS : false),
    gcTime: 0,
  });
  const status: JoinRequestState | undefined = state.data;

  useEffect(() => {
    if (status === "approved" || status === "admitted") onAdmitted();
  }, [status, onAdmitted]);

  const ask = async () => {
    setAsking(true);
    setError(null);
    try {
      qc.setQueryData(key, await askToJoin(getToken, slug));
    } catch (e) {
      setError(e instanceof ChautariError ? e.message : "Couldn't send your request. Try again.");
    } finally {
      setAsking(false);
    }
  };

  const waiting = status === "pending";
  const declined = status === "declined";

  return (
    <View style={styles.container}>
      <View style={[styles.lock, { borderColor: palette.ink }]}>
        <LockIcon color={palette.ink} size={22} locked />
      </View>
      <Text style={[styles.kicker, { color: palette.red }]}>Invite only</Text>
      <Text style={[styles.title, { color: palette.ink }]}>
        {waiting ? "Waiting for the host" : declined ? "Not this time" : "This room is invite only"}
      </Text>
      <Text style={[styles.description, { color: palette.quiet }]}>
        {waiting
          ? "Your request has been sent. Stay here: the room opens as soon as the host or a moderator lets you in."
          : declined
            ? "The host didn't let you in this time. You can ask again in a few minutes."
            : "Ask to join and the host or a moderator can let you in."}
      </Text>

      {state.isLoading ? (
        <ActivityIndicator style={styles.spinner} color={palette.ink} />
      ) : waiting ? (
        <View style={styles.waitingRow} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={palette.ink} />
          <Text style={[styles.waitingText, { color: palette.ink2 }]}>Request sent</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => void ask()}
          disabled={asking}
          accessibilityRole="button"
          accessibilityState={{ disabled: asking, busy: asking }}
          style={({ pressed }) => [styles.button, { backgroundColor: palette.ink }, pressed && styles.pressed]}
        >
          {asking ? (
            <ActivityIndicator size="small" color={palette.paper} />
          ) : (
            <Text style={[styles.buttonText, { color: palette.paper }]}>
              {declined ? "Ask again" : "Ask to join"}
            </Text>
          )}
        </Pressable>
      )}

      {error ? (
        <ErrorMessage compact style={styles.error} message={error} onDismiss={() => setError(null)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.gutter, paddingVertical: 48, alignItems: "flex-start" },
  lock: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.55,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
    marginTop: 10,
  },
  description: { fontFamily: fontFamilies.serifRegular, fontSize: 16.5, lineHeight: 25, marginTop: 12 },
  spinner: { marginTop: 22 },
  waitingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22 },
  waitingText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  button: { marginTop: 22, paddingHorizontal: 18, paddingVertical: 12, minWidth: 140, alignItems: "center" },
  buttonText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  pressed: { opacity: 0.8 },
  error: { marginTop: 14, alignSelf: "stretch" },
});
