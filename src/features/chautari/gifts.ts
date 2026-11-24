/**
 * Gifts in a room.
 *
 * A listener sends the host a gift; the server records it, then pushes a
 * gift packet into the room on GIFT_TOPIC so every app shows it. The packet
 * carries no money (no price, nothing about test coins). The app never sends
 * it itself.
 */

import type { ChatMessage } from "./chat";

/** Must match GIFT_TOPIC in the site's src/lib/chautari/gifts.ts. */
export const GIFT_TOPIC = "chautari.gift";

export interface GiftPacket {
  type: "gift";
  /** The gift's id; the chat history has the same id. Null from an older server. */
  id: string | null;
  authorId: string | null;
  avatarUrl: string | null;
  sentAt: string | null;
  giftId: string;
  /** Shown as given, so a gift added on the server works before an app update. */
  name: string;
  nameNe: string | null;
  /** Who sent it, for a "Sita sent a Diyo" line. */
  by: string;
}

function text(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** Parse a LiveKit data payload; null for anything that is not a gift. */
export function decodeGiftPacket(payload: Uint8Array): GiftPacket | null {
  try {
    const p = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    const giftId = typeof p.giftId === "string" && /^[a-z0-9_]{2,30}$/.test(p.giftId) ? p.giftId : null;
    if (p.type !== "gift" || !giftId) return null;
    return {
      type: "gift",
      id: text(p.id, 64),
      authorId: text(p.authorId, 64),
      avatarUrl: text(p.avatarUrl, 500),
      sentAt: text(p.sentAt, 40),
      giftId,
      name: text(p.name, 40) ?? giftId,
      nameNe: text(p.nameNe, 40),
      by: text(p.by, 60) ?? "A listener",
    };
  } catch {
    return null;
  }
}

/**
 * The chat's entry for a gift announced live, so it sits in the timeline
 * with the messages. Null when the packet lacks what the chat keys on (an
 * older server): the card still plays, only the chat line is skipped.
 */
export function giftMessage(packet: GiftPacket): ChatMessage | null {
  if (!packet.id || !packet.authorId) return null;
  return {
    id: packet.id,
    authorId: packet.authorId,
    name: packet.by,
    avatarUrl: packet.avatarUrl,
    role: "listener",
    text: `sent a ${packet.name}`,
    sentAt: packet.sentAt ?? new Date().toISOString(),
    gift: { giftId: packet.giftId, name: packet.name, nameNe: packet.nameNe },
  };
}

/** Until gift artwork exists: an emoji per gift, a parcel for any other. */
const GIFT_ART: Record<string, string> = { phool: "🌸", chiya: "☕", diyo: "🪔" };

export function giftArt(giftId: string): string {
  return GIFT_ART[giftId] ?? "🎁";
}
