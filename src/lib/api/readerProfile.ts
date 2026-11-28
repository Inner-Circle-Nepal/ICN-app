import { SITE_URL } from "@/constants/config";
import { reportBody, type ReportReasonId, type ReportTarget } from "@/features/reports/reasons";
import type { GetToken } from "./chautari";

/**
 * Reader profile + follow API client.
 *
 * Mirrors `src/lib/api/chautari.ts` in shape: a small `call` helper, Clerk
 * token passed in rather than imported (so this module stays React-free), and
 * errors surface as `ReaderApiError` carrying `reason` + `status` for the UI
 * to branch on.
 *
 * The routes live under `/api/reader/*` on the main site origin (SITE_URL),
 * not the Chautari origin — these endpoints only need Clerk + Supabase,
 * nothing LiveKit-adjacent.
 *
 * Two null-on-404 fetchers (`getMyProfile`, `getProfileByUsername`): React
 * Query consumers need to distinguish "profile does not exist" from "network
 * failure" cleanly, so we turn the 404 `profile_missing` / `profile_not_found`
 * into a resolved `null` rather than throwing.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ReaderProfile = {
  clerk_user_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

/** Set on the reader's own profile when the newsroom has suspended them. */
export type MySuspension = {
  /** The server's wording: the reason, that reading still works, how to appeal. */
  message: string;
  since: string;
};

/** `GET /profile/me`: the profile plus the reader's own suspension, if any. */
export type MyProfile = ReaderProfile & { suspension: MySuspension | null };

export type ProfilePatch = Partial<Pick<ReaderProfile, "display_name" | "bio" | "avatar_url">>;

export type UsernameCheck =
  | { available: true }
  | { available: false; reason: string };

export type FollowStatus = {
  is_following: boolean;
  /** The viewer asked to hear about this reader's Chautari rooms. */
  notify?: boolean;
  follower_count: number;
  is_self: boolean;
};

export type FollowResult = {
  follower_count: number;
  already_following?: boolean;
  already_unfollowed?: boolean;
};

/** A failure the UI can explain without guessing. */
export class ReaderApiError extends Error {
  readonly reason: string;
  readonly status: number;
  constructor(reason: string, message: string, status = 0) {
    super(message);
    this.name = "ReaderApiError";
    this.reason = reason;
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/*  Internal: fetch wrapper                                                    */
/* -------------------------------------------------------------------------- */

const READER_FETCH_TIMEOUT_MS = 6_000;

type CallOptions = {
  /** Required when the endpoint is authed. */
  getToken?: GetToken;
  /** Returned (rather than thrown) when the server answers with this status. */
  nullOn?: number;
  /**
   * With `nullOn`: only that status *with this `reason`* means null. Any other
   * reply with the same status (a proxy's or a half-deployed site's 404) is
   * an error, not an answer.
   */
  nullReason?: string;
  /**
   * If `true`, a `getToken` that resolves to `null` means "call anonymously"
   * instead of throwing `not_signed_in`. Used by endpoints that work for
   * both signed-in and signed-out callers (e.g. follow-status, which hides
   * `is_following` but still returns the public follower count).
   */
  optionalAuth?: boolean;
};

async function call<T>(
  path: string,
  init: RequestInit,
  { getToken, nullOn, nullReason, optionalAuth }: CallOptions = {},
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READER_FETCH_TIMEOUT_MS);

  let headers: Record<string, string> = { "content-type": "application/json" };
  if (getToken) {
    const token = await getToken();
    if (token) {
      headers = { ...headers, authorization: `Bearer ${token}` };
    } else if (!optionalAuth) {
      clearTimeout(timer);
      throw new ReaderApiError("not_signed_in", "Sign in to continue.", 401);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${SITE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (e) {
    throw new ReaderApiError(
      (e as Error).name === "AbortError" ? "timeout" : "offline",
      (e as Error).name === "AbortError"
        ? "That took too long. Please try again."
        : "Could not reach the newsroom. Check your connection.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (nullOn !== undefined && response.status === nullOn) {
    if (nullReason === undefined) return null;
    const reason = await response
      .clone()
      .json()
      .then((p: { reason?: unknown }) => p?.reason)
      .catch(() => null);
    if (reason === nullReason) return null;
    throw new ReaderApiError("server_error", "Something went wrong.", response.status);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ReaderApiError("invalid_response", "Something went wrong.", response.status);
  }

  if (!response.ok || payload.ok !== true) {
    throw new ReaderApiError(
      typeof payload.reason === "string" ? payload.reason : "server_error",
      typeof payload.error === "string" ? payload.error : "Something went wrong.",
      response.status,
    );
  }

  return payload as T;
}

/* -------------------------------------------------------------------------- */
/*  Profile                                                                    */
/* -------------------------------------------------------------------------- */

export async function getMyProfile(getToken: GetToken): Promise<MyProfile | null> {
  const res = await call<{ profile: ReaderProfile; suspension?: MySuspension | null }>(
    "/api/reader/profile/me",
    { method: "GET" },
    // Only the site's own "this account has no profile" sends a reader to the
    // signup form; see `useMyProfile`'s `needsCompletion`.
    { getToken, nullOn: 404, nullReason: "profile_missing" },
  );
  if (!res?.profile) return null;
  const s = res.suspension;
  const suspension =
    s && typeof s.message === "string" ? { message: s.message, since: String(s.since ?? "") } : null;
  return { ...res.profile, suspension };
}

export async function createProfile(
  getToken: GetToken,
  args: { username: string; display_name: string },
): Promise<ReaderProfile> {
  const res = await call<{ profile: ReaderProfile }>(
    "/api/reader/profile/signup",
    { method: "POST", body: JSON.stringify(args) },
    { getToken },
  );
  if (!res) throw new ReaderApiError("server_error", "No response.", 0);
  return res.profile;
}

export async function updateMyProfile(
  getToken: GetToken,
  patch: ProfilePatch,
): Promise<ReaderProfile> {
  const res = await call<{ profile: ReaderProfile }>(
    "/api/reader/profile/me",
    { method: "PATCH", body: JSON.stringify(patch) },
    { getToken },
  );
  if (!res) throw new ReaderApiError("server_error", "No response.", 0);
  return res.profile;
}

export async function getProfileByUsername(username: string): Promise<ReaderProfile | null> {
  const res = await call<{ profile: ReaderProfile }>(
    `/api/reader/profile/${encodeURIComponent(username)}`,
    { method: "GET" },
    { nullOn: 404 },
  );
  return res?.profile ?? null;
}

export async function checkUsername(username: string): Promise<UsernameCheck> {
  const res = await call<{ available: boolean; reason?: string }>(
    "/api/reader/profile/check-username",
    { method: "POST", body: JSON.stringify({ username }) },
  );
  if (!res) throw new ReaderApiError("server_error", "No response.", 0);
  return res.available
    ? { available: true }
    : { available: false, reason: res.reason ?? "unavailable" };
}

/* -------------------------------------------------------------------------- */
/*  Follows                                                                    */
/* -------------------------------------------------------------------------- */

export async function getFollowStatus(
  username: string,
  getToken?: GetToken,
): Promise<FollowStatus | null> {
  // Works signed-out too — server returns `is_following: false` when there
  // is no verified session. `optionalAuth` keeps the request anonymous
  // instead of throwing when getToken resolves null.
  const res = await call<FollowStatus>(
    `/api/reader/profile/${encodeURIComponent(username)}/follow-status`,
    { method: "GET" },
    { getToken, nullOn: 404, optionalAuth: true },
  );
  return res;
}

export async function followUser(
  getToken: GetToken,
  username: string,
): Promise<FollowResult> {
  const res = await call<FollowResult>(
    "/api/reader/follows",
    { method: "POST", body: JSON.stringify({ followee_username: username }) },
    { getToken },
  );
  if (!res) throw new ReaderApiError("server_error", "No response.", 0);
  return res;
}

export async function unfollowUser(
  getToken: GetToken,
  username: string,
): Promise<FollowResult> {
  const res = await call<FollowResult>(
    `/api/reader/follows/${encodeURIComponent(username)}`,
    { method: "DELETE" },
    { getToken },
  );
  if (!res) throw new ReaderApiError("server_error", "No response.", 0);
  return res;
}

/** Hear about this reader's Chautari rooms (they went live, they invited you), or not. */
export async function setFollowNotify(
  getToken: GetToken,
  username: string,
  notify: boolean,
): Promise<void> {
  await call<{ notify: boolean }>(
    `/api/reader/follows/${encodeURIComponent(username)}`,
    { method: "PATCH", body: JSON.stringify({ notify }) },
    { getToken },
  );
}

/* -------------------------------------------------------------------------- */
/*  Push: which reader this phone belongs to                                   */
/* -------------------------------------------------------------------------- */

/**
 * Tie this phone's push token to the signed-in reader, so alerts about the
 * people they follow can reach it. `linked: false` means the token is not
 * registered yet; the next registration links it again.
 */
export async function linkPushToken(getToken: GetToken, token: string): Promise<boolean> {
  const res = await call<{ linked: boolean }>(
    "/api/reader/push-token",
    { method: "POST", body: JSON.stringify({ token }) },
    { getToken },
  );
  return res?.linked ?? false;
}

/** Called before signing out: this phone stops getting that reader's alerts. */
export async function unlinkPushToken(getToken: GetToken, token: string): Promise<void> {
  await call<{ linked: boolean }>(
    "/api/reader/push-token",
    { method: "DELETE", body: JSON.stringify({ token }) },
    { getToken },
  );
}

/* -------------------------------------------------------------------------- */
/*  Reports                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Report a chat message, a person in a room, or a profile. The server copies
 * the evidence into the newsroom's report queue; the reply is the thank-you
 * line to show. Throws ReaderApiError (`cannot_report_self`, `not_found`,
 * `account_suspended`, 429 when sending too many).
 */
export async function sendReport(
  getToken: GetToken,
  target: ReportTarget,
  reason: ReportReasonId,
  details: string,
): Promise<string> {
  const res = await call<{ message?: string }>(
    "/api/reader/report",
    { method: "POST", body: JSON.stringify(reportBody(target, reason, details)) },
    { getToken },
  );
  return res?.message ?? "Thank you. The newsroom reviews every report within 24 hours.";
}

/* -------------------------------------------------------------------------- */
/*  Coins                                                                      */
/* -------------------------------------------------------------------------- */

export type CoinPackInfo = { productId: string; coins: number };
export type GiftInfo = { id: string; name: string; nameNe: string | null; coins: number };

export type Wallet = {
  /** Everything spendable, test coins included. */
  coins: number;
  /** The sandbox part of `coins`: non-zero only for testers and App Review. */
  testCoins: number;
  /** Points from gifts received; real money owed later. */
  points: number;
  /** Points from test gifts; never paid. */
  testPoints: number;
  packs: CoinPackInfo[];
  gifts: GiftInfo[];
  giftsEnabled: boolean;
};

/** The caller's coins and points, the coin packs and the gift catalogue. */
export async function getWallet(getToken: GetToken): Promise<Wallet> {
  const res = await call<Wallet & { ok: true }>("/api/reader/wallet", { method: "GET" }, { getToken });
  const { ok: _ok, ...wallet } = res!;
  return wallet;
}

/** A host's earnings: balances from the wallet, breakdowns from gifts received. */
export interface Earnings {
  points: number;
  /** From test coins; never paid. */
  testPoints: number;
  gifts: number;
  rooms: {
    slug: string;
    title: string;
    at: string;
    gifts: number;
    points: number;
    testPoints: number;
    supporters: number;
  }[];
  supporters: {
    name: string;
    username: string | null;
    avatarUrl: string | null;
    points: number;
    testPoints: number;
  }[];
}

export async function getEarnings(getToken: GetToken): Promise<Earnings> {
  const res = await call<Earnings & { ok: true }>("/api/reader/earnings", { method: "GET" }, { getToken });
  const { ok: _ok, ...earnings } = res!;
  return earnings;
}

export type ConfirmResult = {
  results: { transactionId: string; status: string }[];
  balance: number;
};

/**
 * Ask the server to credit purchases now (it verifies each id with
 * RevenueCat). Safe to repeat: a purchase is credited once however often
 * it is confirmed.
 */
export async function confirmPurchases(
  getToken: GetToken,
  transactionIds: string[],
): Promise<ConfirmResult> {
  const res = await call<ConfirmResult & { ok: true }>(
    "/api/payments/confirm",
    { method: "POST", body: JSON.stringify({ transactionIds }) },
    { getToken },
  );
  return { results: res!.results, balance: res!.balance };
}

/**
 * Have the server credit any of the reader's purchases it hasn't yet. It
 * asks RevenueCat for this reader's purchases itself; the app sends nothing.
 */
export async function syncPurchases(getToken: GetToken): Promise<ConfirmResult> {
  const res = await call<ConfirmResult & { ok: true }>(
    "/api/payments/confirm",
    { method: "POST", body: JSON.stringify({ sync: true }) },
    { getToken },
  );
  return { results: res!.results, balance: res!.balance };
}
