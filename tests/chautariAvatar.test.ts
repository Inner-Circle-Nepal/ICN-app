import { describe, expect, it } from "vitest";
import { initialsFor } from "@/features/chautari/initials";

/**
 * Initials are the whole avatar, because there is no avatar URL anywhere in
 * the Chautari payloads. The input is a `display_name` the server accepts
 * from the client (bounded to 60 characters and otherwise unvalidated) or,
 * failing that, the opaque user id — so this has to survive whatever arrives.
 */

describe("initialsFor", () => {
  it("takes one letter from a single name", () => {
    expect(initialsFor("Sushma")).toBe("S");
  });

  it("takes the first and last of a full name", () => {
    expect(initialsFor("Sushma Thapa")).toBe("ST");
  });

  it("skips middle names rather than crowding the circle", () => {
    expect(initialsFor("Bikash Kumar Rai")).toBe("BR");
  });

  it("uppercases a lowercase name", () => {
    expect(initialsFor("anita gurung")).toBe("AG");
  });

  it("collapses runs of whitespace", () => {
    expect(initialsFor("  Anita   Gurung  ")).toBe("AG");
  });

  /* `display_name` is nullable server-side; the hook then falls back to the
     user id, but an empty string can still reach here. */
  it("never returns an empty label", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
  });

  it("handles a raw user id without crashing", () => {
    expect(initialsFor("user_2abcDEF")).toBe("U");
  });

  it("handles Devanagari, which this audience actually uses", () => {
    // Nepali names must not be mangled into "?" — the app ships Mukta for them.
    expect(initialsFor("सुष्मा थापा")).toBe("सथ");
  });

  it("returns at most two characters for any input", () => {
    for (const name of ["A", "A B", "A B C D E", "Sushma", "सुष्मा थापा", "x".repeat(60)]) {
      expect(initialsFor(name).length).toBeLessThanOrEqual(2);
    }
  });
});
