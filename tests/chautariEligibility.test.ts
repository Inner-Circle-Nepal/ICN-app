import { describe, expect, it } from "vitest";
import {
  buildRequirements,
  countState,
  eligibilitySummary,
  isAccountVerified,
  FOLLOWER_TARGET,
  HOSTING_MINUTES_TARGET,
} from "@/features/chautari/eligibility";

/**
 * Creator monetization eligibility.
 *
 * The thing under test is mostly honesty: three of the four requirements have
 * no data source, and the failure mode is rendering them as `0 / 1,000`,
 * which reads as "you have no followers" rather than "nobody is counting".
 * Most of these assert that distinction survives.
 */

describe("isAccountVerified — real Clerk data", () => {
  const verified = { verification: { status: "verified" } };
  const unverified = { verification: { status: "unverified" } };

  it("accepts a verified email", () => {
    expect(isAccountVerified({ emails: [verified] })).toBe(true);
  });

  it("accepts a verified phone", () => {
    expect(isAccountVerified({ phones: [verified] })).toBe(true);
  });

  /* "At least one verified method is required." */
  it("accepts one verified method alongside an unverified one", () => {
    expect(isAccountVerified({ emails: [unverified], phones: [verified] })).toBe(true);
  });

  it("rejects an account with nothing verified", () => {
    expect(isAccountVerified({ emails: [unverified], phones: [unverified] })).toBe(false);
  });

  it("rejects an account with no identities at all", () => {
    expect(isAccountVerified({})).toBe(false);
    expect(isAccountVerified({ emails: [], phones: [] })).toBe(false);
    expect(isAccountVerified({ emails: null, phones: null })).toBe(false);
  });

  /* Clerk's other statuses are not proof of ownership. */
  it("counts only 'verified', not the other Clerk statuses", () => {
    for (const status of ["transferable", "failed", "expired", "unverified"]) {
      expect(isAccountVerified({ emails: [{ verification: { status } }] })).toBe(false);
    }
  });

  it("survives a malformed identity without throwing", () => {
    expect(isAccountVerified({ emails: [{}, { verification: null }] })).toBe(false);
  });
});

describe("countState — absent is not zero", () => {
  it("reports real progress", () => {
    expect(countState(250, 1000)).toEqual({ kind: "progress", current: 250, target: 1000 });
  });

  it("reports met at or above the target", () => {
    expect(countState(1000, 1000)).toEqual({ kind: "met" });
    expect(countState(1500, 1000)).toEqual({ kind: "met" });
  });

  /* The central distinction. */
  it("treats null and undefined as unavailable, never as zero", () => {
    expect(countState(null, 1000)).toEqual({ kind: "unavailable" });
    expect(countState(undefined, 1000)).toEqual({ kind: "unavailable" });
  });

  it("keeps a REAL zero as progress, distinct from unavailable", () => {
    // A tracked host with genuinely no minutes is not the same as a metric
    // nobody records. The UI draws a bar for one and not the other.
    expect(countState(0, 10000)).toEqual({ kind: "progress", current: 0, target: 10000 });
  });

  it("refuses nonsense rather than rendering it", () => {
    expect(countState(Number.NaN, 1000)).toEqual({ kind: "unavailable" });
    expect(countState(Number.POSITIVE_INFINITY, 1000)).toEqual({ kind: "unavailable" });
    expect(countState(-5, 1000)).toEqual({ kind: "unavailable" });
  });
});

describe("buildRequirements", () => {
  const bare = { verified: false };

  it("always returns the four requirements in programme order", () => {
    expect(buildRequirements(bare).map((r) => r.id)).toEqual([
      "verified",
      "followers",
      "hosting",
      "approval",
    ]);
  });

  it("reflects real verification state", () => {
    expect(buildRequirements({ verified: true })[0].state).toEqual({ kind: "met" });
    expect(buildRequirements({ verified: false })[0].state).toEqual({ kind: "unmet" });
  });

  /* Today's reality: only requirement one has a source. */
  it("marks followers, hosting and approval unavailable when nothing supplies them", () => {
    const reqs = buildRequirements(bare);
    expect(reqs[1].state).toEqual({ kind: "unavailable" });
    expect(reqs[2].state).toEqual({ kind: "unavailable" });
    expect(reqs[3].state).toEqual({ kind: "unavailable" });
  });

  it("shows real counts once an API supplies them", () => {
    const reqs = buildRequirements({ verified: true, followers: 400, hostingMinutes: 12000 });
    expect(reqs[1].state).toEqual({ kind: "progress", current: 400, target: FOLLOWER_TARGET });
    expect(reqs[2].state).toEqual({ kind: "met" });
    expect(HOSTING_MINUTES_TARGET).toBe(10000);
  });

  it("never reports approval as met without an explicit approved status", () => {
    for (const status of [null, undefined, "none", "submitted", "rejected"] as const) {
      expect(buildRequirements({ verified: true, applicationStatus: status })[3].state).not.toEqual(
        { kind: "met" },
      );
    }
    expect(buildRequirements({ verified: true, applicationStatus: "approved" })[3].state).toEqual({
      kind: "met",
    });
  });

  it("does not promise earnings in its copy", () => {
    const text = buildRequirements(bare)
      .map((r) => `${r.title} ${r.body}`)
      .join(" ")
      .toLowerCase();
    expect(text).not.toMatch(/guarantee|you will earn|start earning immediately/);
    // Requirement four must state that applying and approval come first.
    expect(text).toContain("apply");
  });
});

describe("eligibilitySummary", () => {
  it("counts only requirements with a real answer", () => {
    // Verified met; the other three untracked.
    const s = eligibilitySummary(buildRequirements({ verified: true }));
    expect(s).toEqual({ met: 1, tracked: 1, total: 4, eligibleToApply: false });
  });

  /* An ineligible user must never read as approved. */
  it("is not eligible while any requirement is untracked", () => {
    const s = eligibilitySummary(
      buildRequirements({ verified: true, followers: 5000, hostingMinutes: 50000 }),
    );
    expect(s.eligibleToApply).toBe(false); // approval still unavailable
  });

  it("is eligible only when every requirement is tracked and met", () => {
    const s = eligibilitySummary(
      buildRequirements({
        verified: true,
        followers: 5000,
        hostingMinutes: 50000,
        applicationStatus: "approved",
      }),
    );
    expect(s).toEqual({ met: 4, tracked: 4, total: 4, eligibleToApply: true });
  });

  it("is not eligible when a tracked requirement is unmet", () => {
    const s = eligibilitySummary(
      buildRequirements({
        verified: false,
        followers: 5000,
        hostingMinutes: 50000,
        applicationStatus: "approved",
      }),
    );
    expect(s.eligibleToApply).toBe(false);
  });
});
