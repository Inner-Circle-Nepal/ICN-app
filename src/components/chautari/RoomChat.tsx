import React, { useMemo, useState } from "react";
import {
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
import { giftArt } from "@/features/chautari/gifts";
import type { RoomChat } from "@/features/chautari/useRoomChat";
import { useTheme } from "@/hooks/useTheme";
import { fontFamilies, spacing, type ThemePalette } from "@/theme/tokens";
import { Avatar } from "./Avatar";
import type { ReportReasonId } from "@/features/reports/reasons";
import { ActionRow } from "./ActionRow";
import { ReportForm } from "./ReportForm";
import { InfoIcon } from "./RoomIcons";
import { ToastHost } from "@/components/Toast";
import { ConfirmSheet, type ConfirmRequest } from "@/components/ConfirmSheet";
import { ErrorMessage } from "@/components/ErrorMessage";

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
        {latest
          ? latest.gift
            ? `${giftArt(latest.gift.giftId)} ${latest.name} sent a ${latest.gift.name}`
            : `${latest.name}: ${latest.text}`
          : "Say something to the room"}
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

/**
 * A gift in the chat: one quiet line, set apart from what people typed (no
 * avatar or bubble, smaller, muted), so the room's record of who gifted reads
 * in time order without crowding the conversation. Never the price, and no
 * long-press actions: there is nothing to delete or report in a gift.
 */
function GiftLine({
  message,
  gift,
  palette,
}: {
  message: ChatMessage;
  gift: NonNullable<ChatMessage["gift"]>;
  palette: ThemePalette;
}) {
  return (
    <View style={styles.giftRow} accessible accessibilityLabel={`${message.name} sent a ${gift.name}`}>
      <View style={styles.giftArtBox}>
        <Text style={styles.giftArt}>{giftArt(gift.giftId)}</Text>
      </View>
      <Text style={[styles.giftText, { color: palette.quiet }]}>
        <Text style={[styles.giftName, { color: palette.ink }]}>{message.name}</Text> sent a{" "}
        {gift.name}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------- sheet */

/**
 * The chat itself, like the chat beside a live stream: newest at the bottom,
 * a field to write in. Long-press your own message to delete it; long-press
 * anyone else's to remove it (host and moderators), block its author or
 * report it (App Store guideline 1.2: every user must be able to).
 */
export function ChatSheet({
  visible,
  onClose,
  chat,
  myId,
  myRole,
  canWrite,
  cannotWriteReason,
  onBlock,
  onReport,
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
  /** Block the message's author: their audio and messages, on this device. */
  onBlock: (message: ChatMessage) => void;
  onReport: (message: ChatMessage, reason: ReportReasonId, details: string) => void;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  // Someone else's message, long-pressed: its options replace the composer.
  const [acting, setActing] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState(false);
  // The ⓘ beside the title: long-press is invisible until someone says so.
  const [showHelp, setShowHelp] = useState(false);
  /** Asked before deleting your own message. */
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  // Inverted list: newest first in the data, drawn at the bottom.
  const newestFirst = useMemo(() => [...chat.messages].reverse(), [chat.messages]);
  const left = charsLeft(draft);
  const canSend = canWrite && !chat.sending && draft.trim().length > 0 && left >= 0;

  const submit = async () => {
    if (!canSend) return;
    const ok = await chat.send(draft);
    if (ok) setDraft("");
  };

  const closeActions = () => {
    setActing(null);
    setReporting(false);
  };

  const onLongPress = (message: ChatMessage) => {
    if (!myId) return;
    if (message.authorId !== myId) {
      setReporting(false);
      setActing(message);
      return;
    }
    setConfirm({
      title: "Delete your message?",
      message: `“${message.text}”`,
      cancelLabel: "Keep it",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () => chat.remove(message.id),
    });
  };

  const close = () => {
    closeActions();
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.frame}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close chat" />
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
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
                Live chat
              </Text>
              <Pressable
                onPress={() => setShowHelp((v) => !v)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="How the live chat works"
                accessibilityState={{ expanded: showHelp }}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <InfoIcon size={18} color={showHelp ? palette.ink : palette.quiet} />
              </Pressable>
            </View>
            <Pressable
              onPress={close}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close chat"
            >
              <Text style={[styles.close, { color: palette.ink }]}>Close</Text>
            </Pressable>
          </View>

          {showHelp ? (
            <Text
              style={[
                styles.help,
                { color: palette.ink2, backgroundColor: palette.paper2, borderBottomColor: palette.rule },
              ]}
            >
              {myRole === "host" || myRole === "moderator"
                ? "Long-press a message to remove it, block its author or report it."
                : "Long-press a message to block its author or report it."}{" "}
              Long-press your own message to delete it. Blocking hides that person&apos;s messages
              and voice on this phone only. Reports go to the newsroom, which reviews them within
              24 hours.
            </Text>
          ) : null}

          {/*
            The empty state sits outside the list: an inverted FlatList flips
            its content, and whether it flips the empty view too differs by
            platform and version.
          */}
          {newestFirst.length === 0 ? (
            <View style={[styles.list, styles.emptyWrap]}>
              <Text style={[styles.empty, { color: palette.quiet }]}>
                {chat.loading
                  ? "Loading the chat…"
                  : (chat.loadError ?? "No messages yet. Be the first to say something.")}
              </Text>
            </View>
          ) : (
            <FlatList
              data={newestFirst}
              inverted
              keyExtractor={(m) => m.id}
              style={styles.list}
              contentContainerStyle={styles.listBody}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) =>
                item.gift ? (
                  <GiftLine message={item} gift={item.gift} palette={palette} />
                ) : (
                  <Pressable
                    onLongPress={() => onLongPress(item)}
                    delayLongPress={350}
                    accessibilityHint={
                      !myId
                        ? undefined
                        : item.authorId === myId
                          ? "Long-press to delete your message"
                          : "Long-press to remove, block or report"
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
                )
              }
            />
          )}

          {chat.sendError ? (
            <ErrorMessage
              compact
              message={chat.sendError}
              onDismiss={chat.clearSendError}
              style={styles.error}
            />
          ) : null}

          {acting ? (
            <View style={[styles.actions, { borderTopColor: palette.rule }]}>
              {reporting ? (
                <ReportForm
                  heading={`Report ${acting.name}'s message`}
                  question="Why are you reporting this message?"
                  onSubmit={(reason, details) => {
                    onReport(acting, reason, details);
                    closeActions();
                  }}
                  onBack={() => setReporting(false)}
                />
              ) : (
                <>
                  <Text style={[styles.actionsKicker, { color: palette.quiet }]} numberOfLines={1}>
                    {acting.name}: {acting.text}
                  </Text>
                  {canRemoveMessage({ message: acting, myId, myRole }) ? (
                    <ActionRow
                      label="Remove message"
                      danger
                      onPress={() => {
                        void chat.remove(acting.id);
                        closeActions();
                      }}
                    />
                  ) : null}
                  <ActionRow
                    label={`Block ${acting.name}`}
                    danger
                    onPress={() => {
                      onBlock(acting);
                      closeActions();
                    }}
                  />
                  <ActionRow label="Report message" onPress={() => setReporting(true)} />
                  <ActionRow label="Cancel" muted onPress={closeActions} />
                </>
              )}
            </View>
          ) : canWrite ? (
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
      <ConfirmSheet request={confirm} onClose={() => setConfirm(null)} />
      <ToastHost />
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontFamily: fontFamilies.serifMedium, fontSize: 20 },
  help: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: { fontFamily: fontFamilies.sansMedium, fontSize: 13 },

  list: { flex: 1 },
  listBody: { paddingHorizontal: spacing.gutter, paddingVertical: spacing.md, gap: spacing.md },
  empty: {
    fontFamily: fontFamilies.sansRegular,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: spacing.section,
    paddingHorizontal: spacing.gutter,
  },
  emptyWrap: { justifyContent: "flex-end" },
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
  giftRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  /* Same width as a small avatar, so gift lines align with messages. */
  giftArtBox: { width: 34, alignItems: "center" },
  giftArt: { fontSize: 18, lineHeight: 22 },
  giftText: { flex: 1, fontFamily: fontFamilies.sansRegular, fontSize: 13, lineHeight: 18 },
  giftName: { fontFamily: fontFamilies.sansMedium },

  error: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.xs },
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
  actions: {
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionsKicker: {
    fontFamily: fontFamilies.sansMedium,
    fontSize: 12,
    paddingBottom: spacing.xs,
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
