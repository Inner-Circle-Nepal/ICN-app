import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useAuth } from "@clerk/clerk-expo";

import { BottomSheet } from "./BottomSheet";
import { UserSearchField } from "@/components/UserSearchField";
import { ChautariError, inviteToRoom, type InviteResult } from "@/lib/api/chautari";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies } from "@/theme/tokens";
import { ErrorMessage } from "@/components/ErrorMessage";

/**
 * Invite people to a room: pick readers by @handle or name, send once.
 *
 * Only readers who follow you and asked to hear about you get the
 * notification (the server decides, and says who it could not reach), so the
 * sheet says that up front rather than after the fact.
 */

const MAX_PICKS = 10;

type Picked = { username: string; name: string };

export function InviteSheet({
  visible,
  onClose,
  slug,
  exclude,
  membersCanInvite,
}: {
  visible: boolean;
  onClose: () => void;
  slug: string;
  /** Handles not to offer: you, the host, the moderators. */
  exclude: string[];
  /**
   * For the host and moderators: the "Let members invite" switch. Omitted
   * for everyone else, who only invite.
   */
  membersCanInvite?: { value: boolean; busy: boolean; onChange: (value: boolean) => void };
}) {
  const { palette } = useTheme();
  const { getToken } = useAuth();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPicked([]);
    setResult(null);
    setError(null);
    onClose();
  };

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      setResult(
        await inviteToRoom(
          getToken,
          slug,
          picked.map((p) => p.username),
        ),
      );
      setPicked([]);
    } catch (e) {
      setError(e instanceof ChautariError ? e.message : "Could not send invitations. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={close} withInput>
      <Text style={[styles.kicker, { color: palette.quiet }]}>Invite people</Text>
      <Text style={[styles.note, { color: palette.ink2 }]}>
        People who follow you with Chautari alerts on get a notification. Others won&apos;t be
        notified.
      </Text>

      {membersCanInvite ? (
        <View style={[styles.toggleRow, { borderColor: palette.rule }]}>
          <View style={styles.toggleText}>
            <Text style={[styles.toggleLabel, { color: palette.ink }]}>Let members invite</Text>
            <Text style={[styles.toggleHint, { color: palette.quiet }]}>
              Anyone in the room can invite their own followers.
            </Text>
          </View>
          <Switch
            value={membersCanInvite.value}
            disabled={membersCanInvite.busy}
            onValueChange={membersCanInvite.onChange}
            trackColor={{ false: palette.rule2, true: palette.ink }}
            thumbColor={palette.paper}
            accessibilityLabel="Let members invite their followers"
          />
        </View>
      ) : null}

      {result ? (
        <View style={styles.result}>
          {result.invited.length ? (
            <Text style={[styles.resultLine, { color: palette.ink }]}>
              Invited {result.invited.map((u) => `@${u}`).join(", ")}.
            </Text>
          ) : null}
          {result.alreadyInvited.length ? (
            <Text style={[styles.resultLine, { color: palette.quiet }]}>
              Already invited: {result.alreadyInvited.map((u) => `@${u}`).join(", ")}.
            </Text>
          ) : null}
          {result.notReachable.length ? (
            <Text style={[styles.resultLine, { color: palette.quiet }]}>
              Not notified (they don&apos;t get alerts from you):{" "}
              {result.notReachable.map((u) => `@${u}`).join(", ")}.
            </Text>
          ) : null}
        </View>
      ) : null}

      {picked.map((p) => (
        <View key={p.username} style={[styles.row, { borderBottomColor: palette.rule }]}>
          <View style={styles.who}>
            <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={[styles.handle, { color: palette.quiet }]}>@{p.username}</Text>
          </View>
          <Pressable
            onPress={() => setPicked(picked.filter((x) => x.username !== p.username))}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${p.name}`}
            hitSlop={10}
          >
            <Text style={[styles.link, { color: palette.quiet }]}>Remove</Text>
          </Pressable>
        </View>
      ))}

      {picked.length < MAX_PICKS ? (
        <View style={styles.field}>
          <UserSearchField
            onPick={(p) => {
              setResult(null);
              setPicked([...picked, { username: p.username, name: p.display_name }]);
            }}
            exclude={[...exclude, ...picked.map((p) => p.username)]}
            disabled={sending}
            placeholder="@handle or name"
            accessibilityLabel="Find someone to invite"
          />
        </View>
      ) : null}

      {error ? <ErrorMessage message={error} /> : null}

      <Pressable
        onPress={() => void send()}
        disabled={sending || picked.length === 0}
        accessibilityRole="button"
        style={[
          styles.send,
          { backgroundColor: palette.ink, borderColor: palette.ink },
          picked.length === 0 && styles.disabled,
        ]}
      >
        {sending ? (
          <ActivityIndicator color={palette.paper} />
        ) : (
          <Text style={[styles.sendText, { color: palette.paper }]}>
            {picked.length > 1 ? `Send ${picked.length} invitations` : "Send invitation"}
          </Text>
        )}
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  toggleText: { flex: 1 },
  toggleLabel: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  toggleHint: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 2 },
  kicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 6,
  },
  note: { fontFamily: fontFamilies.serifRegular, fontSize: 14.5, lineHeight: 21, marginTop: 8 },
  result: { marginTop: 12, gap: 4 },
  resultLine: { fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  who: { flex: 1, minWidth: 0 },
  name: { fontFamily: fontFamilies.serifMedium, fontSize: 15.5 },
  handle: { fontFamily: fontFamilies.sansRegular, fontSize: 12, marginTop: 1 },
  link: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    textDecorationLine: "underline",
  },
  field: { marginTop: 12 },
  send: {
    marginTop: 16,
    borderWidth: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  disabled: { opacity: 0.4 },
});
