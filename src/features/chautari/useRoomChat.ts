import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChautariError, deleteChat, getChat, sendChat, type GetToken } from "@/lib/api/chautari";
import {
  applyChatPacket,
  mergeMessages,
  normaliseMessage,
  withoutBlocked,
  type ChatMessage,
} from "./chat";
import { giftMessage } from "./gifts";
import type { ChautariRoomState } from "./useChautariRoom";

export interface RoomChat {
  /** What the reader sees: everything except what blocked people wrote. */
  messages: ChatMessage[];
  /** History is loading for the first time. */
  loading: boolean;
  /** History could not be loaded. Live messages still arrive. */
  loadError: string | null;
  sending: boolean;
  /** Why the last send failed, in words for the reader. */
  sendError: string | null;
  clearSendError: () => void;
  /** Resolves true when the server accepted the message. */
  send: (text: string) => Promise<boolean>;
  remove: (messageId: string) => Promise<void>;
  /** Messages that arrived while the chat was closed. */
  unread: number;
  /** Tell the hook whether the reader is looking at the chat. */
  setOpen: (open: boolean) => void;
}

function sendErrorText(e: unknown): string {
  if (!(e instanceof ChautariError)) return "Your message wasn't sent. Try again.";
  switch (e.reason) {
    case "not_in_room":
      return "Join the room to chat.";
    case "removed_from_room":
      return "You were removed from this room.";
    case "room_ended":
      return "This room has ended.";
    case "not_signed_in":
      return "Sign in to chat.";
    case "too_long":
    case "empty":
    case "blocked_words":
    case "account_suspended":
      return e.message;
    default:
      return e.status === 429 ? e.message : "Your message wasn't sent. Try again.";
  }
}

/**
 * Live chat for the room the reader is in.
 *
 * History comes from GET /api/chautari/chat each time the connection is
 * (re)established, so a reader joining late, or coming back from a dropped
 * signal, sees what was said. Everything after that arrives as packets the
 * server pushes into the room (`room.onChatPacket`). The two overlap on
 * purpose and `mergeMessages` removes the duplicates.
 *
 * Messages from people the reader has blocked are kept but not shown or
 * counted, so unblocking brings them back.
 */
export function useRoomChat(
  slug: string,
  room: ChautariRoomState,
  getToken: GetToken,
  blocked: ReadonlySet<string>,
): RoomChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(false);
  const blockedRef = useRef(blocked);
  // Clerk's getToken is not a stable reference; history loads only on (re)connect.
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    blockedRef.current = blocked;
    getTokenRef.current = getToken;
  }, [blocked, getToken]);

  const connected = room.phase === "connected";
  const { onChatPacket, onGiftPacket } = room;

  // A different room starts from an empty chat.
  const [shownSlug, setShownSlug] = useState(slug);
  if (shownSlug !== slug) {
    setShownSlug(slug);
    setMessages([]);
    setUnread(0);
    setLoadError(null);
  }

  useEffect(() => {
    if (!slug || !connected) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getChat(getTokenRef.current, slug);
        if (cancelled) return;
        setMessages((current) => mergeMessages(current, res.messages.map(normaliseMessage)));
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("Couldn't load earlier messages.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug, connected]);

  useEffect(
    () =>
      onChatPacket((packet) => {
        setMessages((current) => applyChatPacket(current, packet));
        if (
          packet.type === "message" &&
          !openRef.current &&
          !blockedRef.current.has(packet.message.authorId)
        ) {
          setUnread((n) => n + 1);
        }
      }),
    [onChatPacket],
  );

  // Gifts join the timeline too (the card is the announcement, so no unread).
  useEffect(
    () =>
      onGiftPacket((packet) => {
        const entry = giftMessage(packet);
        if (entry) setMessages((current) => mergeMessages(current, [entry]));
      }),
    [onGiftPacket],
  );

  const send = useCallback(
    async (text: string) => {
      setSending(true);
      setSendError(null);
      try {
        const message = await sendChat(getToken, slug, text);
        setMessages((current) => mergeMessages(current, [message]));
        return true;
      } catch (e) {
        setSendError(sendErrorText(e));
        return false;
      } finally {
        setSending(false);
      }
    },
    [getToken, slug],
  );

  const remove = useCallback(
    async (messageId: string) => {
      try {
        await deleteChat(getToken, slug, messageId);
        setMessages((current) => current.filter((m) => m.id !== messageId));
      } catch (e) {
        setSendError(e instanceof ChautariError ? e.message : "Couldn't remove that message.");
      }
    },
    [getToken, slug],
  );

  const setOpen = useCallback((open: boolean) => {
    openRef.current = open;
    if (open) setUnread(0);
  }, []);

  const clearSendError = useCallback(() => setSendError(null), []);
  const visible = useMemo(() => withoutBlocked(messages, blocked), [messages, blocked]);

  return {
    messages: visible,
    loading,
    loadError,
    sending,
    sendError,
    clearSendError,
    send,
    remove,
    unread,
    setOpen,
  };
}
