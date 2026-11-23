import { describe, expect, it } from "vitest";
import { mergeShown, settleShown } from "@/features/chautari/enterExit";

const key = (s: string) => s;

describe("mergeShown", () => {
  it("animates nothing on the first data", () => {
    const rows = mergeShown([], ["a", "b"], key, true);
    expect(rows.map((r) => [r.key, r.entering, r.leaving])).toEqual([
      ["a", false, false],
      ["b", false, false],
    ]);
  });

  it("marks a new item entering and keeps the rest still", () => {
    const first = mergeShown([], ["a"], key, true);
    const rows = mergeShown(first, ["b", "a"], key, false);
    expect(rows.map((r) => [r.key, r.entering])).toEqual([
      ["b", true],
      ["a", false],
    ]);
  });

  it("keeps a departed item where it was, marked leaving", () => {
    const first = mergeShown([], ["a", "b", "c"], key, true);
    const rows = mergeShown(first, ["a", "c"], key, false);
    expect(rows.map((r) => [r.key, r.leaving])).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
  });

  it("brings a leaving item straight back if it returns", () => {
    const first = mergeShown([], ["a", "b"], key, true);
    const gone = mergeShown(first, ["a"], key, false);
    const back = mergeShown(gone, ["a", "b"], key, false);
    expect(back.map((r) => [r.key, r.leaving])).toEqual([
      ["a", false],
      ["b", false],
    ]);
  });
});

describe("settleShown", () => {
  it("drops departed rows and makes arrivals ordinary", () => {
    const first = mergeShown([], ["a", "b"], key, true);
    const moved = mergeShown(first, ["c", "a"], key, false);
    expect(settleShown(moved).map((r) => [r.key, r.entering, r.leaving])).toEqual([
      ["c", false, false],
      ["a", false, false],
    ]);
  });
});
