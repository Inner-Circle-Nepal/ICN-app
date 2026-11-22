import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  MAX_CHAT_LENGTH,
  canRemoveMessage,
  charsLeft,
  type ChatMessage,
  type ChatRole,
} from "@/features/chautari/chat";
import type { RoomChat } from "@/features/chautari/useRoomChat";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing, type ThemePalette } from "@/theme/tokens";
import { Avatar } from "./Avatar";

/* ------------------------------------------------------------ role tag */

function RoleTag({ role, palette }: { role: ChatRole; palette: ThemePalette }) {
  if (role === "listener") return null;
  const label = role === "host" ? "Host" : role === "moderator" ? "Mod" : "Speaker";
  const strong = role === "host" || role === "moderator";
  return (
    <Text
      style={[
        styles.tag,
        strong
          ? { color: palette.paper, backgroundColor: role === "host" ? palette.red : palette.ink }
          : { color: palette.ink, borderColor: palette.rule2, borderWidth: StyleSheet.hairlineWidth },
      ]}
    >
      {label}
    </Text>
  );
}

/* --------------------------------------------------------------- strip */

/**
 * One line above the room controls: the latest message and how many arrived
 * while the chat was closed. Tapping it opens the chat.
 */
export function ChatStrip({
  chat,
  onOpen,
}: {
  chat: RoomChat;
  onOpen: () => void;
}) {
  const { palette } = useTheme();
  const latest = chat.messages[chat.messages.length - 1] ?? null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={
        chat.unread > 0 ? `Open live chat, ${chat.unread} new messages` : "Open live chat"
      }
      style={({ pressed }) => [
        styles.strip,
        { borderTopColor: palette.rule, backgroundColor: palette.paper },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.stripLabel, { color: palette.ink }]}>Live chat</Text>
      <Text style={[styles.stripPreview, { color: palette.quiet }]} numberOfLines={1}>
        {latest ? `${latest.name}: ${latest.text}` : "Say something to the room"}
      </Text>
      {chat.unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: palette.red }]}>
          <Text style={[styles.badgeText, { color: "#fff" }]}>
            {chat.unread > 99 ? "99+" : chat.unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* --------------------------------------------------------------- sheet */

/**
 * The chat itself, like the chat beside a live stream: newest at the bottom,
 * a field to write in, and a long-press to remove a message for whoever may.
 */
export function ChatSheet({
  visible,
  onClose,
  chat,
  myId,
  myRole,
  canWrite,
  cannotWriteReason,
}: {
  visible: boolean;
  onClose: () => void;
  chat: RoomChat;
  myId: string | null;
  myRole: ChatRole | null;
  /** Signed in and connected to the room. */
  canWrite: boolean;
  /** Shown in place of the field when `canWrite` is false. */
  cannotWriteReason: string;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");

  // Inverted list: newest first in the data, drawn at the bottom.
  const newestFirst = useMemo(() => [...chat.messages].reverse(), [chat.messages]);
  const left = charsLeft(draft);
  const canSend = canWrite && !chat.sending && draft.trim().length > 0 && left >= 0;

  const submit = async () => {
    if (!canSend) return;
    const ok = await chat.send(draft);
    if (ok) setDraft("");
  };

  const askRemove = (message: ChatMessage) => {
    if (!canRemoveMessage({ message, myId, myRole })) return;
    const own = message.authorId === myId;
    Alert.alert(
      own ? "Delete your message?" : `Remove ${message.name}'s message?`,
      message.text,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: own ? "Delete" : "Remove",
          style: "destructive",
          onPress: () => void chat.remove(message.id),
        },
      ],
    );
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.frame}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close chat" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.paper,
              borderTopColor: palette.ink,
              paddingBottom: Math.max(12, insets.bottom),
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: palette.rule }]}>
            <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
              Live chat
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close chat"
            >
              <Text style={[styles.close, { color: palette.ink }]}>Close</Text>
            </Pressable>
          </View>

          <FlatList
            data={newestFirst}
            inverted
            keyExtractor={(m) => m.id}
            style={styles.list}
            contentContainerStyle={styles.listBody}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[styles.empty, { color: palette.quiet }]}>
                {chat.loading
                  ? "Loading the chat…"
                  : (chat.loadError ?? "No messages yet. Be the first to say something.")}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onLongPress={() => askRemove(item)}
                delayLongPress={350}
                accessibilityHint={
                  canRemoveMessage({ message: item, myId, myRole })
                    ? "Long-press to remove this message"
                    : undefined
                }
                style={styles.row}
              >
                <Avatar name={item.name} size="sm" imageUrl={item.avatarUrl} />
                <View style={styles.rowBody}>
                  <View style={styles.nameLine}>
                    <Text
                      style={[styles.name, { color: palette.quiet }]}
                      numberOfLines={1}
                    >
                      {item.authorId === myId ? `${item.name} (you)` : item.name}
                    </Text>
                    <RoleTag role={item.role} palette={palette} />
                  </View>
                  <Text style={[styles.text, { color: palette.ink }]}>{item.text}</Text>
                </View>
              </Pressable>
            )}
          />

          {chat.sendError ? (
            <Pressable onPress={chat.clearSendError} accessibilityRole="button">
              <Text style={[styles.error, { color: palette.red }]}>{chat.sendError}</Text>
            </Pressable>
          ) : null}

          {canWrite ? (
            <View style={[styles.composer, { borderTopColor: palette.rule }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Say something…"
                placeholderTextColor={palette.quiet}
                style={[styles.input, { color: palette.ink, borderColor: palette.rule2 }]}
                maxLength={MAX_CHAT_LENGTH + 20}
                returnKeyType="send"
                submitBehavior="submit"
                onSubmitEditing={() => void submit()}
                accessibilityLabel="Chat message"
              />
              {left < 40 ? (
                <Text style={[styles.count, { color: left < 0 ? palette.red : palette.quiet }]}>
                  {left}
                </Text>
              ) : null}
              <Pressable
                onPress={() => void submit()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: !canSend }}
                style={({ pressed }) => [
                  styles.send,
                  { backgroundColor: palette.ink, opacity: canSend ? 1 : 0.35 },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.sendText, { color: palette.paper }]}>
                  {chat.sending ? "…" : "Send"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.cannot, { color: palette.quiet, borderTopColor: palette.rule }]}>
              {cannotWriteReason}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },

  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stripLabel: { fontFamily: fontFamilies.sansMedium, fontSize: 12, letterSpacing: 0.4 },
  stripPreview: { flex: 1, fontFamily: fontFamilies.sansRegular, fontSize: 13 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fontFamilies.sansMedium, fontSize: 11 },

  frame: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { height: "75%", borderTopWidth: 2 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontFamily: fontFamilies.serifMedium, fontSize: 20 },
  close: { fontFamily: fontFamilies.sansMedium, fontSize: 13 },

  list: { flex: 1 },
  listBody: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.md, gap: spacing.md },
  empty: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: spacing.section,
    // The list is inverted, so its empty view is drawn upside down.
    transform: [{ scaleY: -1 }],
  },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  rowBody: { flex: 1 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontFamily: fontFamilies.sansMedium, fontSize: 12, flexShrink: 1 },
  tag: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    overflow: "hidden",
    borderRadius: 3,
  },
  text: { fontFamily: fontFamilies.sansRegular, fontSize: 15, lineHeight: 21, marginTop: 1 },

  error: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 13,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xs,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontFamily: fontFamilies.sansRegular,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  count: { fontFamily: fontFamilies.sansRegular, fontSize: 12, minWidth: 24, textAlign: "right" },
  send: { paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: 20 },
  sendText: { fontFamily: fontFamilies.sansMedium, fontSize: 13 },
  cannot: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 13,
    textAlign: "center",
    paddingTop: spacing.md,
    paddingHorizontal: spacing.gutter,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
