import type { DiscoverRoom } from "@/lib/api/chautari";

/**
 * Turning the discovery payload into a single list of rows.
 *
 * ## Why this is a module rather than two `.filter()` calls in the screen
 *
 * The screen used to pass only the live rooms to `FlatList.data` and render
 * the scheduled ones from `ListFooterComponent`. `ListEmptyComponent` keys off
 * `data`, so with nothing live and something scheduled the list rendered
 *
 *     "No conversations right now … When one starts, it will appear here."
 *
 * directly above a populated "Coming up" section. The screen contradicted
 * itself, and no test could catch it because the logic was inline in JSX.
 *
 * One list fixes it: section headings become rows, so emptiness is a property
 * of the whole feed rather than of one of its halves.
 */

export type FeedRow =
  | { kind: "section"; key: string; title: string; cta?: string }
  | {
      kind: "room";
      key: string;
      room: DiscoverRoom;
      firstInSection: boolean;
      /**
       * "featured" is the lead live room, set larger the way a front page
       * sets its lead story. It is NOT a ranking: the API already returns
       * live rooms newest-first, and this takes the first of them. There is
       * no popularity signal in the payload to rank on, and inventing one
       * would mean inventing data.
       */
      variant: "featured" | "compact";
    };

/**
 * What the screen should show, decided once.
 *
 * `rooms` is undefined until the first response — distinct from an empty
 * array, which means the newsroom genuinely has nothing on air.
 */
export type FeedState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "rows"; rows: FeedRow[]; liveCount: number; upcomingCount: number };

/**
 * Build the row list.
 *
 * Order follows the API, which already sorts live before scheduled and newest
 * first within each (`site/src/app/api/chautari/discover/route.ts`). Nothing
 * is re-ranked here — a "featured" room would be an invented ranking, and
 * there is no signal in the payload to base one on.
 */
export function buildFeedRows(rooms: DiscoverRoom[]): FeedRow[] {
  const live = rooms.filter((r) => r.status === "live");
  const upcoming = rooms.filter((r) => r.status === "scheduled");

  const rows: FeedRow[] = [];

  if (live.length > 0) {
    rows.push({
      kind: "section",
      key: "section-live",
      title: "On air now",
      cta: `${live.length} live`,
    });
    live.forEach((room, i) =>
      rows.push({
        kind: "room",
        key: `live-${room.slug}`,
        room,
        firstInSection: i === 0,
        variant: i === 0 ? "featured" : "compact",
      }),
    );
  }

  if (upcoming.length > 0) {
    rows.push({ kind: "section", key: "section-upcoming", title: "Coming up" });
    upcoming.forEach((room, i) =>
      rows.push({
        kind: "room",
        key: `up-${room.slug}`,
        room,
        firstInSection: i === 0,
        /* Nothing scheduled is "on air", so nothing scheduled leads. */
        variant: "compact",
      }),
    );
  }

  return rows;
}

/**
 * The one place that decides which of the five states the screen is in.
 *
 * Separated from rendering so each state can be asserted directly. The order
 * matters: a refetch that fails while rooms are already on screen keeps the
 * rooms rather than replacing them with an error — losing a visible schedule
 * because a poll timed out is worse than showing one that is a minute old.
 */
export function feedState(args: {
  rooms: DiscoverRoom[] | undefined;
  isLoading: boolean;
  isError: boolean;
}): FeedState {
  const { rooms, isLoading, isError } = args;

  if (rooms && rooms.length > 0) {
    const rows = buildFeedRows(rooms);
    return {
      kind: "rows",
      rows,
      liveCount: rooms.filter((r) => r.status === "live").length,
      upcomingCount: rooms.filter((r) => r.status === "scheduled").length,
    };
  }

  if (isLoading) return { kind: "loading" };
  if (isError) return { kind: "error" };
  return { kind: "empty" };
}

/**
 * What a row announces to a screen reader, and what the footer line reads.
 *
 * Built here rather than in JSX so the "full" wording is identical in both and
 * cannot drift. Counts come straight from the payload; nothing is estimated.
 */
export function roomSummary(room: DiscoverRoom): string {
  const parts: string[] = [room.title];
  parts.push(room.status === "live" ? "Live now" : "Scheduled");
  if (room.isFull) parts.push("Room is full");
  if (room.hostName) parts.push(`Hosted by ${room.hostName}`);
  parts.push(`${room.speakers} ${room.speakers === 1 ? "speaker" : "speakers"}`);
  parts.push(`${room.listeners} listening`);
  return parts.join(". ") + ".";
}
