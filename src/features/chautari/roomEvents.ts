/**
 * Room events the server sends on their own topic (the site's
 * src/lib/chautari/roomEvents.ts): the room's lock and "members may invite"
 * changed (to everyone), or someone is asking to join (only to the host and
 * moderators). Parsed defensively: anything malformed is ignored. Pure, for
 * tests.
 */

export const ROOM_TOPIC = "chautari.room";

export type RoomEventPacket =
  | { type: "settings"; inviteOnly: boolean; membersCanInvite: boolean }
  | {
      type: "join_request";
      requestId: string;
      name: string;
      username: string | null;
      avatarUrl: string | null;
    }
  | { type: "join_requests_changed" };

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export function decodeRoomEvent(payload: Uint8Array): RoomEventPacket | null {
  try {
    const p = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    if (p.type === "settings" && typeof p.inviteOnly === "boolean" && typeof p.membersCanInvite === "boolean") {
      return { type: "settings", inviteOnly: p.inviteOnly, membersCanInvite: p.membersCanInvite };
    }
    if (p.type === "join_request") {
      const requestId = text(p.requestId, 64);
      if (!requestId) return null;
      const avatar = text(p.avatarUrl, 500);
      return {
        type: "join_request",
        requestId,
        name: text(p.name, 60) ?? "Someone",
        username: text(p.username, 30),
        // Only pictures from the web, never data: or file: URLs from a packet.
        avatarUrl: avatar && /^https?:\/\//.test(avatar) ? avatar : null,
      };
    }
    if (p.type === "join_requests_changed") return { type: "join_requests_changed" };
  } catch {
    /* not ours */
  }
  return null;
}
