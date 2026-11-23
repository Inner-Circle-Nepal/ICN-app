import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  MAX_REPORT_DETAILS,
  REPORT_REASONS,
  type ReportReasonId,
} from "@/features/reports/reasons";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing } from "@/theme/tokens";
import { ActionRow } from "./ActionRow";

/**
 * Reporting, in two steps: why, then anything to add. Used for a person in a
 * room (PersonSheet) and for a chat message (RoomChat). The server attaches
 * the evidence itself (who, the room, the message and its time), so the
 * reader is only asked what they know that the record doesn't.
 */
export function ReportForm({
  heading,
  question,
  onSubmit,
  onBack,
}: {
  /** e.g. "Report Maya" or "Report Maya's message". */
  heading: string;
  /** e.g. "Why are you reporting them?" */
  question: string;
  onSubmit: (reason: ReportReasonId, details: string) => void;
  onBack: () => void;
}) {
  const { palette } = useTheme();
  const [reason, setReason] = useState<ReportReasonId | null>(null);
  const [details, setDetails] = useState("");

  if (!reason) {
    return (
      <View>
        <Text style={[styles.kicker, { color: palette.quiet }]}>{heading}</Text>
        <Text style={[styles.title, { color: palette.ink }]}>{question}</Text>
        <View style={[styles.rows, { borderTopColor: palette.rule }]}>
          {REPORT_REASONS.map((r) => (
            <ActionRow key={r.id} label={r.label} onPress={() => setReason(r.id)} />
          ))}
          <ActionRow label="Back" muted onPress={onBack} />
        </View>
      </View>
    );
  }

  const label = REPORT_REASONS.find((r) => r.id === reason)?.label ?? "";
  return (
    <View>
      <Text style={[styles.kicker, { color: palette.quiet }]}>
        {heading} · {label}
      </Text>
      <Text style={[styles.title, { color: palette.ink }]}>Anything to add?</Text>
      <Text style={[styles.hint, { color: palette.quiet }]}>
        Optional. What happened, or what we should look for. Only the newsroom sees this;
        the person isn&apos;t told who reported them.
      </Text>
      <TextInput
        value={details}
        onChangeText={setDetails}
        multiline
        maxLength={MAX_REPORT_DETAILS}
        placeholder="Add details (optional)"
        placeholderTextColor={palette.quiet}
        style={[styles.input, { color: palette.ink, borderColor: palette.rule2 }]}
        accessibilityLabel="Anything to add"
      />
      <View style={styles.buttons}>
        <Pressable
          onPress={() => setReason(null)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, { borderColor: palette.rule2 }, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, { color: palette.ink }]}>Back</Text>
        </Pressable>
        <Pressable
          onPress={() => onSubmit(reason, details)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: palette.ink, borderColor: palette.ink },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, { color: palette.paper }]}>Send report</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamilies.serifLight,
    fontSize: 24,
    lineHeight: 29,
    marginTop: 6,
  },
  hint: { fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 18, marginTop: 6 },
  rows: { borderTopWidth: 1, marginTop: 18 },
  input: {
    minHeight: 88,
    maxHeight: 160,
    marginTop: spacing.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 15,
    textAlignVertical: "top",
  },
  buttons: { flexDirection: "row", gap: 10, marginTop: spacing.md },
  button: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  pressed: { opacity: 0.75 },
});
