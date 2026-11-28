import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { BottomSheet } from "./chautari/BottomSheet";

/**
 * A question before something that can't be taken back (sign out, delete,
 * remove someone), in the app's own style instead of a system alert.
 *
 * Keep, on the left, is the safe answer, and so is a tap outside or Back.
 * The action itself is only ever the filled button. While a returned promise
 * runs, the sheet shows a spinner and can't be closed; it closes when the
 * promise settles (the caller shows any error where it belongs).
 *
 * Usage: hold a `ConfirmRequest | null` in state, set it to ask, and render
 * `<ConfirmSheet request={confirm} onClose={() => setConfirm(null)} />`.
 */
export interface ConfirmRequest {
  title: string;
  message?: string;
  /** The action, e.g. "Delete account". */
  confirmLabel: string;
  /** The safe way out, e.g. "Keep my account". */
  cancelLabel: string;
  /** Red action (deletes, removes, ends). Otherwise ink. */
  destructive?: boolean;
  onConfirm: () => void | Promise<unknown>;
}

export function ConfirmSheet({
  request,
  onClose,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const [busy, setBusy] = useState(false);

  const confirm = () => {
    if (!request || busy) return;
    const result = request.onConfirm();
    if (!result) {
      onClose();
      return;
    }
    setBusy(true);
    void result.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      setBusy(false);
      onClose();
    });
  };

  const actionColor = request?.destructive ? palette.red : palette.ink;
  // White on red in both themes (as LeaveSheet); paper on ink.
  const actionText = request?.destructive ? "#ffffff" : palette.paper;

  return (
    <BottomSheet visible={request !== null} onClose={() => !busy && onClose()}>
      {request ? (
        <View>
          <Text style={[styles.title, { color: palette.ink }]}>{request.title}</Text>
          {request.message ? (
            <Text style={[styles.body, { color: palette.quiet }]}>{request.message}</Text>
          ) : null}
          <View style={styles.row}>
            <Pressable
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={request.cancelLabel}
              accessibilityState={{ disabled: busy }}
              style={({ pressed }) => [
                styles.btn,
                { borderColor: palette.rule2, opacity: busy ? 0.4 : 1 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.btnText, { color: palette.ink }]}>{request.cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={request.confirmLabel}
              accessibilityState={{ disabled: busy, busy }}
              style={({ pressed }) => [
                styles.btn,
                { borderColor: actionColor, backgroundColor: actionColor },
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={actionText} />
              ) : (
                <Text style={[styles.btnText, { color: actionText }]}>
                  {request.confirmLabel}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
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
  row: { flexDirection: "row", gap: 10, marginTop: 20 },
  btn: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  pressed: { opacity: 0.75 },
});
