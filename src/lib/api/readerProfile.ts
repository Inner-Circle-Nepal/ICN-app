import { SITE_URL } from "@/constants/config";
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

export type ProfilePatch = Partial<Pick<ReaderProfile, "display_name" | "bio" | "avatar_url">>;

export type UsernameCheck =
  | { available: true }
  | { available: false; reason: string };

export type FollowStatus = {
  is_following: boolean;
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
  { getToken, nullOn, optionalAuth }: CallOptions = {},
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
    return null;
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

export async function getMyProfile(getToken: GetToken): Promise<ReaderProfile | null> {
  const res = await call<{ profile: ReaderProfile }>(
    "/api/reader/profile/me",
    { method: "GET" },
    { getToken, nullOn: 404 },
  );
  return res?.profile ?? null;
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
