import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { useFollowNotifyMutation } from "@/features/profile/useFollow";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";

/**
 * Asked right after following someone: hear about their Chautari rooms?
 *
 * The soft ask before the OS one. Saying yes saves the choice on the follow
 * and, if this phone has never allowed notifications, only then shows the
 * system prompt. Content only: the profile screen puts it in a bottom sheet,
 * and a room's person sheet swaps it in for its own content, since iOS will
 * not stack a second modal on the first.
 */
export function FollowAlertPrompt({
  name,
  username,
  onDone,
}: {
  name: string;
  username: string;
  onDone: () => void;
}) {
  const { palette } = useTheme();
  const notify = useFollowNotifyMutation();
  const [note, setNote] = useState<string | null>(null);

  const accept = () => {
    notify.mutate(
      { username, notify: true },
      {
        onSuccess: ({ phoneNote }) => {
          if (phoneNote) setNote(phoneNote);
          else onDone();
        },
        onError: () => setNote("Could not save that. Try again from their profile."),
      },
    );
  };

  if (note) {
    return (
      <View>
        <Text style={[styles.body, { color: palette.ink2 }]}>{note}</Text>
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          style={[styles.secondary, { borderColor: palette.ink }]}
        >
          <Text style={[styles.buttonText, { color: palette.ink }]}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.kicker, { color: palette.quiet }]}>Following @{username}</Text>
      <Text style={[styles.title, { color: palette.ink }]}>Hear when {name} goes live?</Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>
        We&apos;ll send you a notification when {name} starts a Chautari room or invites you
        to one. You can turn this off anytime from their profile.
      </Text>
      <Pressable
        onPress={accept}
        disabled={notify.isPending}
        accessibilityRole="button"
        style={[styles.primary, { backgroundColor: palette.ink, borderColor: palette.ink }]}
      >
        {notify.isPending ? (
          <ActivityIndicator color={palette.paper} />
        ) : (
          <Text style={[styles.buttonText, { color: palette.paper }]}>Notify me</Text>
        )}
      </Pressable>
      <Pressable
        onPress={onDone}
        disabled={notify.isPending}
        accessibilityRole="button"
        style={[styles.secondary, { borderColor: palette.rule2 }]}
      >
        <Text style={[styles.buttonText, { color: palette.ink }]}>Not now</Text>
      </Pressable>
    </View>
  );
}

/**
 * The per-person switch on a followed reader's profile: the place the prompt
 * promises they can turn these alerts off.
 */
export function FollowAlertToggle({
  name,
  username,
  value,
}: {
  name: string;
  username: string;
  value: boolean;
}) {
  const { palette } = useTheme();
  const notify = useFollowNotifyMutation();
  const [note, setNote] = useState<string | null>(null);

  const change = (next: boolean) => {
    setNote(null);
    notify.mutate(
      { username, notify: next },
      {
        onSuccess: ({ phoneNote }) => setNote(phoneNote),
        onError: () => setNote("Could not save that. Please try again."),
      },
    );
  };

  return (
    <View style={[styles.toggleRow, { borderBottomColor: palette.rule }]}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleTitle, { color: palette.ink }]}>Chautari alerts</Text>
        <Text style={[styles.toggleDesc, { color: palette.quiet }]}>
          When {name} goes live or invites you to a room.
        </Text>
        {note ? <Text style={[styles.toggleNote, { color: palette.ink2 }]}>{note}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={change}
        disabled={notify.isPending}
        trackColor={{ false: palette.rule2, true: palette.ink }}
        thumbColor={palette.paper}
        accessibilityLabel={`Chautari alerts from ${name}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 6,
  },
  title: {
    fontFamily: fontFamilies.serifMedium,
    fontSize: 22,
    lineHeight: 28,
    marginTop: 6,
  },
  body: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  primary: {
    marginTop: 20,
    borderWidth: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    marginTop: 10,
    borderWidth: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  toggleText: { flex: 1 },
  toggleTitle: { fontFamily: fontFamilies.serifMedium, fontSize: 16 },
  toggleDesc: { fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 18, marginTop: 2 },
  toggleNote: { fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 18, marginTop: 6 },
});
