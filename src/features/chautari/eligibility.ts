/**
 * Creator monetization eligibility, as far as this app can honestly report it.
 *
 * ## The distinction this module exists to protect
 *
 * There are four requirements and only ONE of them has data behind it today.
 * The tempting shortcut is to render the other three as `0 / 1,000` — a
 * progress bar at zero looks finished and costs nothing to write. It is also
 * a lie: it tells a host they have no followers when the truth is that this
 * product has no follower system at all, and it would quietly become wrong in
 * the other direction the moment one is built.
 *
 * So `unavailable` is a first-class state, distinct from `progress` at zero,
 * and the UI renders it as "not yet tracked" rather than as a bar. Nothing
 * here invents a count.
 *
 * No `react-native` or `@clerk/*` import, so it runs under vitest's node
 * environment — the same reason `initials.ts` and `profile/photo.ts` are
 * separate modules.
 */

/** Thresholds, stated once. Display-only — the server decides eligibility. */
export const FOLLOWER_TARGET = 1000;
export const HOSTING_MINUTES_TARGET = 10000;

export type RequirementId = "verified" | "followers" | "hosting" | "approval";

export type MetricState =
  /** Satisfied, on real data. */
  | { kind: "met" }
  /** Genuinely not satisfied, on real data. */
  | { kind: "unmet" }
  /** Real count against a real target. Never synthesised. */
  | { kind: "progress"; current: number; target: number }
  /**
   * No source of truth exists yet. NOT the same as zero, and the UI must not
   * draw a bar for it. Every one of these is a `[needs API]` item.
   */
  | { kind: "unavailable" };

export interface Requirement {
  id: RequirementId;
  title: string;
  /** One sentence. No promises about approval or earnings. */
  body: string;
  state: MetricState;
}

/**
 * Anything carrying a Clerk-shaped verification, structurally typed so this
 * module needs no Clerk import.
 */
export interface VerifiableIdentity {
  verification?: { status?: string | null } | null;
}

/**
 * Is at least one email address or phone number verified?
 *
 * "At least one" is the programme's wording, so a host with a verified phone
 * and an unverified spare email still qualifies. Clerk's `VerificationStatus`
 * also includes `transferable`, `failed` and `expired`; only `verified`
 * counts, because the others all mean the identity is not yet proven.
 */
export function isAccountVerified(args: {
  emails?: readonly VerifiableIdentity[] | null;
  phones?: readonly VerifiableIdentity[] | null;
}): boolean {
  const all = [...(args.emails ?? []), ...(args.phones ?? [])];
  return all.some((i) => i?.verification?.status === "verified");
}

/**
 * Turn a possibly-absent count into a state.
 *
 * `null` and `undefined` mean "no source of truth" and become `unavailable`.
 * A genuine zero from a real source stays `progress` at zero — the two are
 * not interchangeable, which is the whole point.
 */
export function countState(current: number | null | undefined, target: number): MetricState {
  if (typeof current !== "number" || !Number.isFinite(current) || current < 0) {
    return { kind: "unavailable" };
  }
  return current >= target ? { kind: "met" } : { kind: "progress", current, target };
}

export interface EligibilityInput {
  /** From Clerk — the one metric with a real source today. */
  verified: boolean;
  /** `[needs API]` — no follower system exists. Pass null until one does. */
  followers?: number | null;
  /** `[needs API]` — derivable from chautari_rooms, but no endpoint aggregates it. */
  hostingMinutes?: number | null;
  /** `[needs API]` — no application table, no endpoint, no flow. */
  applicationStatus?: "none" | "submitted" | "approved" | "rejected" | null;
}

/**
 * The four requirements, in the order the programme states them.
 *
 * Copy is deliberately careful: meeting the thresholds makes a host *able to
 * apply*, never approved and never earning. Requirement four says so outright
 * so the list cannot be read as a promise.
 */
export function buildRequirements(input: EligibilityInput): Requirement[] {
  return [
    {
      id: "verified",
      title: "Verify your account",
      body: "Confirm a valid email address or phone number. At least one verified method is required.",
      state: input.verified ? { kind: "met" } : { kind: "unmet" },
    },
    {
      id: "followers",
      title: "Reach 1,000 followers",
      body: "Build an audience of at least 1,000 followers on icn.news.",
      state: countState(input.followers, FOLLOWER_TARGET),
    },
    {
      id: "hosting",
      title: "Host for 10,000 minutes",
      body: "Accumulate 10,000 qualifying minutes hosting Chautari rooms. Only eligible live-room time counts.",
      state: countState(input.hostingMinutes, HOSTING_MINUTES_TARGET),
    },
    {
      id: "approval",
      title: "Apply and be approved",
      body: "Eligible creators can apply, accept the programme terms, and set up an approved payout method before earning.",
      /*
       * Never "met" from the client. Approval is a decision somebody else
       * makes, and there is no endpoint that reports it — so until one
       * exists this is unavailable, not unmet, and certainly not met.
       */
      state:
        input.applicationStatus === "approved"
          ? { kind: "met" }
          : input.applicationStatus == null
            ? { kind: "unavailable" }
            : { kind: "unmet" },
    },
  ];
}

/**
 * How many requirements can we actually speak to?
 *
 * Used for the summary line. Counts only requirements with a real answer, so
 * the header never implies progress through metrics nobody is tracking.
 */
export function eligibilitySummary(requirements: readonly Requirement[]): {
  met: number;
  tracked: number;
  total: number;
  /** True only when every requirement is tracked AND met. */
  eligibleToApply: boolean;
} {
  const tracked = requirements.filter((r) => r.state.kind !== "unavailable");
  const met = tracked.filter((r) => r.state.kind === "met");
  return {
    met: met.length,
    tracked: tracked.length,
    total: requirements.length,
    eligibleToApply:
      tracked.length === requirements.length && met.length === requirements.length,
  };
}
