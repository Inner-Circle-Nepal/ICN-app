/**
 * Live chat in a Chautari room — shared types and the pure list logic.
 *
 * Messages are never broadcast by the app. It POSTs to /api/chautari/chat; the
 * server checks the writer is in the room, stores the message and pushes it
 * to everyone over LiveKit on CHAT_TOPIC (listeners hold no data-publish
 * grant on purpose). This file only merges what arrives.
 */

/** Must match CHAT_TOPIC in the site's src/lib/chautari/chat.ts. */
export const CHAT_TOPIC = "chautari.chat";

/** Must match MAX_CHAT_LENGTH on the server. */
export const MAX_CHAT_LENGTH = 300;

/** How many messages the app keeps in memory for one room. */
export const CHAT_KEEP = 200;

export type ChatRole = "host" | "moderator" | "speaker" | "listener";

export interface ChatMessage {
  id: string;
  authorId: string;
  name: string;
  avatarUrl: string | null;
  role: ChatRole;
  text: string;
  sentAt: string;
  /** Set when the entry is a gift, not typed text (see `giftMessage`). Never the price. */
  gift?: { giftId: string; name: string; nameNe: string | null };
}

export type ChatPacket =
  | { type: "message"; message: ChatMessage }
  | { type: "delete"; id: string };

function isMessage(v: unknown): v is ChatMessage {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.authorId === "string" &&
    typeof m.name === "string" &&
    typeof m.text === "string" &&
    typeof m.sentAt === "string"
  );
}

function giftOf(v: unknown): ChatMessage["gift"] {
  if (!v || typeof v !== "object") return undefined;
  const g = v as Record<string, unknown>;
  if (typeof g.giftId !== "string" || typeof g.name !== "string") return undefined;
  return { giftId: g.giftId, name: g.name, nameNe: typeof g.nameNe === "string" ? g.nameNe : null };
}

/** A history entry from the server, with `gift` kept only when well-formed. */
export function normaliseMessage(m: ChatMessage): ChatMessage {
  const gift = giftOf((m as { gift?: unknown }).gift);
  const { gift: _ignored, ...rest } = m;
  return gift ? { ...rest, gift } : rest;
}

/** Parse a LiveKit data payload; null for anything that is not a chat packet. */
export function decodeChatPacket(payload: Uint8Array): ChatPacket | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    if (parsed.type === "delete" && typeof parsed.id === "string") {
      return { type: "delete", id: parsed.id };
    }
    if (parsed.type === "message" && isMessage(parsed.message)) {
      return { type: "message", message: parsed.message };
    }
  } catch {
    /* not ours */
  }
  return null;
}

/**
 * Add messages to a list: duplicates (the same message arriving from the send
 * response AND the broadcast, or history overlapping live packets) collapse to
 * one, order is by send time, and only the newest CHAT_KEEP are kept.
 */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  if (incoming.length === 0) return current as ChatMessage[];
  const byId = new Map<string, ChatMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  const all = [...byId.values()].sort(
    (a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.id.localeCompare(b.id),
  );
  return all.length > CHAT_KEEP ? all.slice(all.length - CHAT_KEEP) : all;
}

/** Apply one live packet to the list. */
export function applyChatPacket(
  current: readonly ChatMessage[],
  packet: ChatPacket,
): ChatMessage[] {
  if (packet.type === "delete") return current.filter((m) => m.id !== packet.id);
  return mergeMessages(current, [packet.message]);
}

/**
 * Leave out what blocked people wrote. Blocking is the reader's own choice
 * (kept on the device, see chautariBlocks.ts): it silences a person's audio
 * and hides their messages, without anyone else being told.
 */
export function withoutBlocked(
  messages: readonly ChatMessage[],
  blocked: ReadonlySet<string>,
): ChatMessage[] {
  if (blocked.size === 0) return messages as ChatMessage[];
  return messages.filter((m) => !blocked.has(m.authorId));
}

/**
 * Whether to offer "Remove" on a message. The server decides for real; this
 * only avoids showing a button that would be refused.
 */
export function canRemoveMessage(args: {
  message: ChatMessage;
  myId: string | null;
  myRole: ChatRole | null;
}): boolean {
  if (!args.myId) return false;
  if (args.myRole === "host" || args.myRole === "moderator") return true;
  return args.message.authorId === args.myId;
}

/** Characters left, counting emoji as one, as the server does. */
export function charsLeft(text: string): number {
  return MAX_CHAT_LENGTH - [...text].length;
}
