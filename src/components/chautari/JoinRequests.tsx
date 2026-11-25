import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { ErrorMessage } from "@/components/ErrorMessage";
import { useTheme } from "@/hooks/useTheme";
import { ChautariError, type JoinRequest } from "@/lib/api/chautari";
import { fontFamilies } from "@/theme/tokens";
import { timeAgo } from "@/utils/format";
import { Avatar } from "./Avatar";
import { BottomSheet } from "./BottomSheet";

/** How many faces show before the count says the rest. */
const FACES = 3;

/**
 * For the host and moderators: who is asking to join, as faces and a count
 * (the same shape as the supporters row). Hidden when nobody is waiting.
 * Tapping opens the sheet below.
 */
export function JoinRequestsStrip({ requests, onPress }: { requests: JoinRequest[]; onPress: () => void }) {
  const { palette } = useTheme();
  const count = requests.length;
  if (count === 0) return null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${count === 1 ? "person is" : "people are"} asking to join. Review requests`}
      hitSlop={6}
      style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
    >
      <View style={styles.faces}>
        {requests.slice(0, FACES).map((r, i) => (
          <View
            key={r.requestId}
            // A ring of paper separates each face from the one it overlaps.
            style={[styles.face, { borderColor: palette.paper, zIndex: FACES - i }, i > 0 && styles.overlap]}
          >
            <Avatar name={r.name} size="sm" imageUrl={r.avatarUrl} />
          </View>
        ))}
      </View>
      <Text style={[styles.label, { color: palette.ink }]}>
        {count} asking to join
      </Text>
      <View style={[styles.dot, { backgroundColor: palette.red }]} />
    </Pressable>
  );
}

/** Everyone waiting, oldest first, each with Let in / Decline. */
export function JoinRequestsSheet({
  visible,
  onClose,
  requests,
  onDecide,
}: {
  visible: boolean;
  onClose: () => void;
  requests: JoinRequest[];
  onDecide: (requestId: string, approve: boolean) => Promise<unknown>;
}) {
  const { palette } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (r: JoinRequest, approve: boolean) => {
    if (busy) return;
    setBusy(r.requestId);
    setError(null);
    try {
      await onDecide(r.requestId, approve);
    } catch (e) {
      setError(e instanceof ChautariError ? e.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.kicker, { color: palette.quiet }]}>Invite only</Text>
      <Text style={[styles.title, { color: palette.ink }]}>Asking to join</Text>

      {requests.length === 0 ? (
        <Text style={[styles.empty, { color: palette.quiet }]}>Nobody is waiting right now.</Text>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.requestId}
          style={[styles.list, { borderTopColor: palette.rule }]}
          renderItem={({ item }) => {
            const deciding = busy === item.requestId;
            return (
              <View style={[styles.row, { borderBottomColor: palette.rule }]}>
                <Avatar name={item.name} size="sm" imageUrl={item.avatarUrl} />
                <View style={styles.who}>
                  <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.detail, { color: palette.quiet }]} numberOfLines={1}>
                    {item.username ? `@${item.username} · ` : ""}
                    {timeAgo(item.askedAt)}
                  </Text>
                </View>
                {deciding ? (
                  <ActivityIndicator size="small" color={palette.ink} />
                ) : (
                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => void decide(item, false)}
                      disabled={Boolean(busy)}
                      accessibilityRole="button"
                      accessibilityLabel={`Decline ${item.name}`}
                      hitSlop={6}
                      style={({ pressed }) => [styles.btn, { borderColor: palette.rule2 }, pressed && styles.pressed]}
                    >
                      <Text style={[styles.btnText, { color: palette.ink }]}>Decline</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void decide(item, true)}
                      disabled={Boolean(busy)}
                      accessibilityRole="button"
                      accessibilityLabel={`Let ${item.name} in`}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.btn,
                        { backgroundColor: palette.ink, borderColor: palette.ink },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.btnText, { color: palette.paper }]}>Let in</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {error ? (
        <ErrorMessage compact style={styles.error} message={error} onDismiss={() => setError(null)} />
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 10, marginTop: 12 },
  pressed: { opacity: 0.6 },
  faces: { flexDirection: "row" },
  face: { borderWidth: 2, borderRadius: 19 },
  overlap: { marginLeft: -12 },
  label: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: { fontFamily: fontFamilies.serifLight, fontSize: 24, lineHeight: 29, marginTop: 6 },
  empty: { fontFamily: fontFamilies.serifRegular, fontSize: 15, lineHeight: 22, marginTop: 14, marginBottom: 8 },
  list: { borderTopWidth: 1, marginTop: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  who: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  detail: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 1 },
  actions: { flexDirection: "row", gap: 8 },
  btn: { borderWidth: 1, paddingHorizontal: 12, minHeight: 34, justifyContent: "center" },
  btnText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  error: { marginTop: 14 },
});
