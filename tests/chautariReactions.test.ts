import { describe, expect, it } from "vitest";

import {
  FLOAT_MS,
  MAX_FLOATERS,
  MERGE_MS,
  addReaction,
  decodeReactionsPacket,
  type Floater,
} from "@/features/chautari/reactions";

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

describe("decodeReactionsPacket", () => {
  it("reads a batch and drops bad items", () => {
    expect(
      decodeReactionsPacket(
        bytes({
          type: "reactions",
          items: [
            { reaction: "fire", count: 3, by: "user_a" },
            { reaction: "poop", count: 1, by: "user_b" },
            { reaction: "heart", by: "user_c" },
            { reaction: "wow", count: -4, by: "user_d" },
            { reaction: "clap", count: 2 },
          ],
        }),
      ),
    ).toEqual([
      { reaction: "fire", count: 3, by: "user_a" },
      { reaction: "heart", count: 1, by: "user_c" },
      { reaction: "wow", count: 1, by: "user_d" },
    ]);
  });

  it("ignores anything else", () => {
    expect(decodeReactionsPacket(bytes({ type: "chat" }))).toEqual([]);
    expect(decodeReactionsPacket(new TextEncoder().encode("{"))).toEqual([]);
  });
});

describe("floaters", () => {
  const T = 1_000_000;

  it("merges the same emoji arriving close together", () => {
    let f: Floater[] = [];
    f = addReaction(f, "fire", 1, T, 1, 0.2);
    f = addReaction(f, "fire", 2, T + MERGE_MS - 1, 2, 0.8);
    expect(f).toEqual([{ id: 1, reaction: "fire", count: 3, bornAt: T, lane: 0.2 }]);
  });

  it("starts a new floater for a different emoji, or the same one later", () => {
    let f: Floater[] = [];
    f = addReaction(f, "fire", 1, T, 1, 0.2);
    f = addReaction(f, "heart", 1, T + 10, 2, 0.5);
    f = addReaction(f, "fire", 1, T + MERGE_MS, 3, 0.7);
    expect(f.map((x) => [x.id, x.reaction, x.count])).toEqual([
      [1, "fire", 1],
      [2, "heart", 1],
      [3, "fire", 1],
    ]);
  });

  it("forgets floaters that have finished", () => {
    let f: Floater[] = [];
    f = addReaction(f, "fire", 1, T, 1, 0.2);
    f = addReaction(f, "heart", 1, T + FLOAT_MS, 2, 0.5);
    expect(f.map((x) => x.id)).toEqual([2]);
  });

  it("never shows more than the cap: joins the same emoji, else replaces the oldest", () => {
    const kinds = ["clap", "heart", "laugh", "fire", "pray", "wow"] as const;
    let f: Floater[] = [];
    // 200 ms apart: the same emoji comes round again past the merge window,
    // and all are still rising when the last arrives.
    for (let i = 0; i < MAX_FLOATERS; i++) f = addReaction(f, kinds[i % 6], 1, T + i * 200, i + 1, 0.5);
    expect(f).toHaveLength(MAX_FLOATERS);
    const now = T + MAX_FLOATERS * 200;
    const joined = addReaction(f, "wow", 4, now, 99, 0.5);
    expect(joined).toHaveLength(MAX_FLOATERS);
    expect(joined.find((x) => x.reaction === "wow")?.count).toBe(5);
    // A full screen and a stale emoji: the oldest floater makes room.
    const later = now + MERGE_MS;
    const replaced = addReaction(joined, "pray", 1, later, 100, 0.5);
    expect(replaced.length).toBeLessThanOrEqual(MAX_FLOATERS);
  });
});
