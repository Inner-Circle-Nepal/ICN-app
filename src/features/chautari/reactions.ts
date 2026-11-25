/**
 * Emoji reactions (the site's src/lib/chautari/reactions.ts). Anyone in a
 * live room can react; every app floats the emoji up and fades it.
 *
 * Kept calm in a busy room: the same emoji arriving close together merges
 * into one floater with a count ("🔥 ×12") instead of a stream of copies,
 * and at most MAX_FLOATERS are on screen. Pure, for tests.
 */

export const REACTION_TOPIC = "chautari.reaction";

export const REACTIONS = [
  { id: "clap", emoji: "👏", label: "Applause" },
  { id: "heart", emoji: "❤️", label: "Love" },
  { id: "laugh", emoji: "😂", label: "Laugh" },
  { id: "fire", emoji: "🔥", label: "Fire" },
  { id: "pray", emoji: "🙏", label: "Thanks" },
  { id: "wow", emoji: "😮", label: "Wow" },
] as const;

export type ReactionId = (typeof REACTIONS)[number]["id"];

const EMOJI = new Map<string, string>(REACTIONS.map((r) => [r.id, r.emoji]));

export function reactionEmoji(id: ReactionId): string {
  return EMOJI.get(id) ?? "👏";
}

export function isReactionId(v: unknown): v is ReactionId {
  return typeof v === "string" && EMOJI.has(v);
}

/** Taps sent in one request (the server allows at most this many). */
export const MAX_PER_REQUEST = 5;

export interface ReactionItem {
  reaction: ReactionId;
  count: number;
  /** Who reacted (their identity), so an app can skip its own echo. */
  by: string;
}

/** A batch from the server; anything malformed is dropped item by item. */
export function decodeReactionsPacket(payload: Uint8Array): ReactionItem[] {
  try {
    const p = JSON.parse(new TextDecoder().decode(payload)) as { type?: unknown; items?: unknown };
    if (p.type !== "reactions" || !Array.isArray(p.items)) return [];
    const items: ReactionItem[] = [];
    for (const raw of p.items.slice(0, 200)) {
      const i = raw as Record<string, unknown>;
      if (!isReactionId(i.reaction) || typeof i.by !== "string") continue;
      const count = typeof i.count === "number" && Number.isFinite(i.count) ? Math.floor(i.count) : 1;
      items.push({ reaction: i.reaction, by: i.by, count: Math.min(999, Math.max(1, count)) });
    }
    return items;
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------- floaters */

/** One emoji on its way up the screen. */
export interface Floater {
  id: number;
  reaction: ReactionId;
  count: number;
  bornAt: number;
  /** Where across its lane it rises, 0..1, so floaters don't stack. */
  lane: number;
}

/** How long a floater takes to rise and fade. */
export const FLOAT_MS = 2800;
/** The same emoji within this long of a floater joins it instead. */
export const MERGE_MS = 900;
/** Most floaters on screen at once. */
export const MAX_FLOATERS = 8;

/**
 * Add `count` of a reaction: merged into a young floater of the same emoji,
 * or a new floater; when the screen is full, into any floater of that emoji,
 * else it replaces the oldest. `lane` is supplied (random in the app).
 */
export function addReaction(
  floaters: Floater[],
  reaction: ReactionId,
  count: number,
  now: number,
  id: number,
  lane: number,
): Floater[] {
  const live = floaters.filter((f) => now - f.bornAt < FLOAT_MS);
  const young = live.find((f) => f.reaction === reaction && now - f.bornAt < MERGE_MS);
  const join = young ?? (live.length >= MAX_FLOATERS ? live.find((f) => f.reaction === reaction) : undefined);
  if (join) return live.map((f) => (f === join ? { ...f, count: f.count + count } : f));

  const fresh: Floater = { id, reaction, count, bornAt: now, lane };
  if (live.length < MAX_FLOATERS) return [...live, fresh];
  const oldest = live.reduce((a, b) => (b.bornAt < a.bornAt ? b : a));
  return [...live.filter((f) => f !== oldest), fresh];
}
