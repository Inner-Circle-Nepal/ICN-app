import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { BottomSheet } from "./BottomSheet";

/**
 * How the host or a moderator leaves a room: slip away (the room carries on)
 * or end it for everyone. Ending takes a second, deliberate step in the same
 * sheet. In that step a tap outside or Back only returns to the choice, never
 * ends anything.
 *
 * Listeners and speakers have nothing to choose and never see this.
 */
export function LeaveSheet({
  visible,
  lastInCharge,
  ending,
  onClose,
  onLeave,
  onEnd,
}: {
  visible: boolean;
  /** Nobody else running the room is in it: leaving starts the 5-minute close. */
  lastInCharge: boolean;
  /** The end request is on its way. */
  ending: boolean;
  onClose: () => void;
  onLeave: () => void;
  /** Confirmed: end the room for everyone. */
  onEnd: () => void;
}) {
  const { palette } = useTheme();
  const [step, setStep] = useState<"choose" | "confirm">("choose");

  const close = () => {
    setStep("choose");
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={step === "confirm" ? () => !ending && setStep("choose") : close}
    >
      {step === "choose" ? (
        <View>
          <Text style={[styles.title, { color: palette.ink }]}>Leave this room?</Text>
          {lastInCharge ? (
            <Text style={[styles.body, { color: palette.quiet }]}>
              Nobody else is running this room. If you leave, it closes for everyone in 5
              minutes unless the host or a moderator joins.
            </Text>
          ) : null}

          <Pressable
            onPress={() => {
              setStep("choose");
              onLeave();
            }}
            accessibilityRole="button"
            accessibilityLabel="Leave quietly. The room carries on without you."
            style={({ pressed }) => [
              styles.option,
              { borderColor: palette.rule2 },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.optionLabel, { color: palette.ink }]}>Leave quietly</Text>
            <Text style={[styles.optionHint, { color: palette.quiet }]}>
              The room carries on without you
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setStep("confirm")}
            accessibilityRole="button"
            accessibilityLabel="End room for everyone. Everyone is disconnected now."
            style={({ pressed }) => [
              styles.option,
              { borderColor: palette.red },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.optionLabel, { color: palette.red }]}>End room for everyone</Text>
            <Text style={[styles.optionHint, { color: palette.quiet }]}>
              Everyone is disconnected now
            </Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Text style={[styles.title, { color: palette.ink }]}>End this room?</Text>
          <Text style={[styles.body, { color: palette.quiet }]}>
            Everyone will be disconnected. This cannot be undone.
          </Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => setStep("choose")}
              disabled={ending}
              accessibilityRole="button"
              accessibilityState={{ disabled: ending }}
              style={({ pressed }) => [
                styles.btn,
                { borderColor: palette.rule2, opacity: ending ? 0.4 : 1 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.btnText, { color: palette.ink }]}>Keep talking</Text>
            </Pressable>
            <Pressable
              onPress={onEnd}
              disabled={ending}
              accessibilityRole="button"
              accessibilityLabel="End room"
              accessibilityState={{ disabled: ending, busy: ending }}
              style={({ pressed }) => [
                styles.btn,
                { borderColor: palette.red, backgroundColor: palette.red },
                pressed && styles.pressed,
              ]}
            >
              {ending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={[styles.btnText, { color: "#ffffff" }]}>End room</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fontFamilies.serifLight, fontSize: 24, lineHeight: 29 },
  body: {
    fontFamily: fontFamilies.serifRegular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  option: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 14,
  },
  optionLabel: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  optionHint: { fontFamily: fontFamilies.sansRegular, fontSize: 13, marginTop: 4 },
  row: { flexDirection: "row", gap: 10, marginTop: 20 },
  btn: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pressed: { opacity: 0.75 },
});
