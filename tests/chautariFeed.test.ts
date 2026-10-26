import { describe, expect, it } from "vitest";
import { buildFeedRows, feedState, roomSummary } from "@/features/chautari/feed";
import type { DiscoverRoom } from "@/lib/api/chautari";

/**
 * The discovery feed's state machine.
 *
 * These exist because of a bug that no amount of reading the screen caught:
 * live rooms were `FlatList.data` and scheduled rooms were rendered from
 * `ListFooterComponent`, so `ListEmptyComponent` fired whenever nothing was
 * live — printing "No conversations right now" directly above a populated
 * "Coming up" list. The logic now lives in a module precisely so that case
 * can be asserted rather than eyeballed.
 */

function room(over: Partial<DiscoverRoom> & { slug: string }): DiscoverRoom {
  return {
    title: `Room ${over.slug}`,
    description: null,
    hostName: null,
    status: "live",
    startedAt: null,
    scheduledFor: null,
    listeners: 0,
    speakers: 0,
    isFull: false,
    ...over,
  };
}

describe("feedState — the five states are distinct", () => {
  it("is loading before the first response", () => {
    expect(feedState({ rooms: undefined, isLoading: true, isError: false })).toEqual({
      kind: "loading",
    });
  });

  it("is an error when the request failed and nothing is cached", () => {
    expect(feedState({ rooms: undefined, isLoading: false, isError: true })).toEqual({
      kind: "error",
    });
  });

  it("is empty when the newsroom genuinely has nothing on air", () => {
    expect(feedState({ rooms: [], isLoading: false, isError: false })).toEqual({ kind: "empty" });
  });

  it("shows rows when live rooms exist", () => {
    const state = feedState({
      rooms: [room({ slug: "a" }), room({ slug: "b" })],
      isLoading: false,
      isError: false,
    });
    expect(state.kind).toBe("rows");
    if (state.kind !== "rows") throw new Error("unreachable");
    expect(state.liveCount).toBe(2);
    expect(state.upcomingCount).toBe(0);
  });

  /* The regression this module was written for. */
  it("does NOT report empty when only upcoming rooms exist", () => {
    const state = feedState({
      rooms: [room({ slug: "later", status: "scheduled" })],
      isLoading: false,
      isError: false,
    });
    expect(state.kind).toBe("rows");
    if (state.kind !== "rows") throw new Error("unreachable");
    expect(state.liveCount).toBe(0);
    expect(state.upcomingCount).toBe(1);
    // "Coming up" is present and no empty state can be reached.
    expect(state.rows.some((r) => r.kind === "section" && r.title === "Coming up")).toBe(true);
    expect(state.rows.some((r) => r.kind === "section" && r.title === "On air now")).toBe(false);
  });

  it("keeps showing rooms when a refetch fails over populated data", () => {
    // A poll that times out must not replace a visible schedule with an error.
    const state = feedState({
      rooms: [room({ slug: "a" })],
      isLoading: false,
      isError: true,
    });
    expect(state.kind).toBe("rows");
  });

  it("keeps showing rooms while a refresh is in flight", () => {
    const state = feedState({
      rooms: [room({ slug: "a" })],
      isLoading: true,
      isError: false,
    });
    expect(state.kind).toBe("rows");
  });
});

describe("buildFeedRows", () => {
  it("returns nothing for no rooms", () => {
    expect(buildFeedRows([])).toEqual([]);
  });

  it("emits a live section with a count, then the rooms", () => {
    const rows = buildFeedRows([room({ slug: "a" }), room({ slug: "b" })]);
    expect(rows[0]).toMatchObject({ kind: "section", title: "On air now", cta: "2 live" });
    expect(rows.slice(1).every((r) => r.kind === "room")).toBe(true);
  });

  it("emits both sections in order when both kinds exist", () => {
    const rows = buildFeedRows([
      room({ slug: "live-1" }),
      room({ slug: "soon", status: "scheduled" }),
    ]);
    const sections = rows.filter((r) => r.kind === "section").map((r) => r.kind === "section" && r.title);
    expect(sections).toEqual(["On air now", "Coming up"]);
  });

  it("marks only the first room in each section, so rules fall between rows", () => {
    const rows = buildFeedRows([
      room({ slug: "a" }),
      room({ slug: "b" }),
      room({ slug: "c", status: "scheduled" }),
    ]);
    const firsts = rows.filter((r) => r.kind === "room").map((r) => r.kind === "room" && r.firstInSection);
    expect(firsts).toEqual([true, false, true]);
  });

  it("gives every row a unique key across sections", () => {
    const rows = buildFeedRows([
      room({ slug: "same" }),
      room({ slug: "same", status: "scheduled" }),
    ]);
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("invents no rooms and drops none", () => {
    const input = [room({ slug: "a" }), room({ slug: "b", status: "scheduled" })];
    const roomRows = buildFeedRows(input).filter((r) => r.kind === "room");
    expect(roomRows).toHaveLength(2);
  });
});

describe("the lead live room", () => {
  const variants = (rooms: DiscoverRoom[]) =>
    buildFeedRows(rooms)
      .filter((r) => r.kind === "room")
      .map((r) => (r.kind === "room" ? r.variant : null));

  it("features the first live room and no other", () => {
    expect(variants([room({ slug: "a" }), room({ slug: "b" }), room({ slug: "c" })])).toEqual([
      "featured",
      "compact",
      "compact",
    ]);
  });

  /*
   * The lead is the API's own first live room, not a ranking. There is no
   * popularity signal in the payload, and inventing one would be inventing
   * data — so a room with far more listeners does NOT overtake the lead.
   */
  it("does not re-rank by listener count", () => {
    const rows = buildFeedRows([
      room({ slug: "first", listeners: 2 }),
      room({ slug: "popular", listeners: 900 }),
    ]).filter((r) => r.kind === "room");
    expect(rows[0].kind === "room" && rows[0].room.slug).toBe("first");
    expect(rows[0].kind === "room" && rows[0].variant).toBe("featured");
  });

  it("never features a scheduled room, even when nothing is live", () => {
    expect(
      variants([room({ slug: "a", status: "scheduled" }), room({ slug: "b", status: "scheduled" })]),
    ).toEqual(["compact", "compact"]);
  });

  it("features the lead even when it is full — the server still decides", () => {
    const rows = buildFeedRows([room({ slug: "a", isFull: true })]).filter((r) => r.kind === "room");
    expect(rows[0].kind === "room" && rows[0].variant).toBe("featured");
  });
});

describe("roomSummary — what a screen reader hears", () => {
  it("states live status, host and counts", () => {
    const text = roomSummary(
      room({ slug: "a", title: "Budget 2082", hostName: "Sushma", listeners: 47, speakers: 3 }),
    );
    expect(text).toContain("Budget 2082");
    expect(text).toContain("Live now");
    expect(text).toContain("Hosted by Sushma");
    expect(text).toContain("3 speakers");
    expect(text).toContain("47 listening");
  });

  it("announces a full room, so it is not conveyed by dimming alone", () => {
    expect(roomSummary(room({ slug: "a", isFull: true }))).toContain("Room is full");
  });

  it("says Scheduled for an upcoming room", () => {
    expect(roomSummary(room({ slug: "a", status: "scheduled" }))).toContain("Scheduled");
  });

  it("uses the singular for one speaker", () => {
    expect(roomSummary(room({ slug: "a", speakers: 1 }))).toContain("1 speaker.");
  });

  it("omits the host when the payload has none", () => {
    expect(roomSummary(room({ slug: "a" }))).not.toContain("Hosted by");
  });
});
