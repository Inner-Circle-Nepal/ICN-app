import { CHAUTARI_API_URL } from "@/constants/config";

/**
 * Talking to the Chautari endpoints on the website.
 *
 * Every call that is not discovery carries a Clerk session token in an
 * `Authorization` header, which the server verifies before it will do
 * anything. The app holds no LiveKit credential and no Supabase service key:
 * it asks for a short-lived join token and is told what it may do.
 *
 * `getToken` is passed in rather than imported so this module stays free of
 * React — the caller gets it from Clerk's `useAuth()` and hands it over.
 */

export type RoomRole = "host" | "moderator" | "speaker" | "listener";
export type RoomStatus = "scheduled" | "live" | "ended";

export interface DiscoverRoom {
  slug: string;
  title: string;
  description: string | null;
  hostName: string | null;
  status: "scheduled" | "live";
  startedAt: string | null;
  scheduledFor: string | null;
  listeners: number;
  speakers: number;
  isFull: boolean;
  /** Cover photo, 16:9. Null for rooms without one (and older servers). */
  bannerUrl?: string | null;
  hostUsername?: string | null;
  hostAvatarUrl?: string | null;
}

/** A person shown on a room's details: its host or a moderator. */
export interface RoomPerson {
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

/** One room's public details, for the waiting room before it goes live. */
export interface RoomDetails {
  slug: string;
  title: string;
  description: string | null;
  status: RoomStatus;
  scheduledFor: string | null;
  startedAt: string | null;
  bannerUrl: string | null;
  host: RoomPerson;
  moderators: RoomPerson[];
}

/** A room the reader hosts or moderates, on the "Your rooms" page. */
export interface MyRoom {
  slug: string;
  title: string;
  status: "scheduled" | "live";
  scheduledFor: string | null;
  startedAt: string | null;
  bannerUrl: string | null;
  role: "host" | "moderator";
}

export interface JoinGrant {
  token: string;
  url: string;
  identity: string;
  role: RoomRole;
  canPublish: boolean;
  expiresInSeconds: number;
  room: { slug: string; title: string; status: RoomStatus };
}

/** A failure the UI can explain without guessing. */
export class ChautariError extends Error {
  readonly reason: string;
  readonly status: number;
  constructor(reason: string, message: string, status = 0) {
    super(message);
    this.name = "ChautariError";
    this.reason = reason;
    this.status = status;
  }
}

export type GetToken = () => Promise<string | null>;

/**
 * Per-request timeout for Chautari API calls.
 *
 * The upstream used to be 20s. In practice a healthy server responds in well
 * under a second; a 20s wait is only ever hit when the backend is unreachable.
 * During an outage that long wait, multiplied by React Query's default three
 * retries, left readers staring at a spinner for close to a minute before the
 * error state rendered. Six seconds is short enough to fail fast to a clear
 * "offline" message and long enough to tolerate a slow handset on 3G.
 */
const CHAUTARI_FETCH_TIMEOUT_MS = 6_000;

async function call<T>(
  path: string,
  init: RequestInit,
  getToken?: GetToken,
  /** A photo upload over a mobile connection needs longer than a JSON call. */
  timeoutMs: number = CHAUTARI_FETCH_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let headers: Record<string, string> = { "content-type": "application/json" };
  if (getToken) {
    const token = await getToken();
    if (!token) {
      clearTimeout(timer);
      throw new ChautariError("not_signed_in", "Sign in to continue.", 401);
    }
    headers = { ...headers, authorization: `Bearer ${token}` };
  }

  let response: Response;
  try {
    response = await fetch(`${CHAUTARI_API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (e) {
    throw new ChautariError(
      (e as Error).name === "AbortError" ? "timeout" : "offline",
      (e as Error).name === "AbortError"
        ? "That took too long. Please try again."
        : "Could not reach the newsroom. Check your connection.",
    );
  } finally {
    clearTimeout(timer);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ChautariError("invalid_response", "Something went wrong.", response.status);
  }

  if (!response.ok || payload.ok !== true) {
    throw new ChautariError(
      typeof payload.reason === "string" ? payload.reason : "server_error",
      typeof payload.error === "string" ? payload.error : "Something went wrong.",
      response.status,
    );
  }

  return payload as T;
}

/** Public: no sign-in needed to see what is on air. */
export async function discoverRooms(): Promise<DiscoverRoom[]> {
  const res = await call<{ rooms: DiscoverRoom[] }>("/api/chautari/discover", {
    method: "GET",
  });
  return res.rooms ?? [];
}

export async function openRoom(
  getToken: GetToken,
  args: {
    title: string;
    description?: string;
    hostName?: string | null;
    /** ISO time to book the room for; omitted opens it now. */
    scheduledFor?: string | null;
    /** A URL returned by `uploadBanner`. */
    bannerUrl?: string | null;
    /** Up to three @handles to make moderators from the start. */
    moderators?: string[];
  },
): Promise<{ slug: string; title: string; status: RoomStatus }> {
  const res = await call<{ room: { slug: string; title: string; status: RoomStatus } }>(
    "/api/chautari/rooms",
    { method: "POST", body: JSON.stringify(args) },
    getToken,
  );
  return res.room;
}

/**
 * Upload a cover photo for a room about to be created. The server resizes it
 * and returns the URL to pass to `openRoom`.
 */
export async function uploadBanner(getToken: GetToken, base64: string): Promise<string> {
  const res = await call<{ url: string }>(
    "/api/chautari/banner",
    { method: "POST", body: JSON.stringify({ image: base64 }) },
    getToken,
    60_000,
  );
  return res.url;
}

/** Go live: start a booked room. Host or an assigned moderator only. */
export async function startRoom(getToken: GetToken, slug: string): Promise<void> {
  await call("/api/chautari/rooms/start", { method: "POST", body: JSON.stringify({ slug }) }, getToken);
}

/**
 * A room's public details. Pass `getToken` when signed in to also learn
 * whether this reader may start it.
 */
export async function getRoomDetails(
  slug: string,
  getToken?: GetToken,
): Promise<{ room: RoomDetails; canStart: boolean }> {
  return call<{ room: RoomDetails; canStart: boolean }>(
    `/api/chautari/rooms/${encodeURIComponent(slug)}`,
    { method: "GET" },
    getToken,
  );
}

export type InviteResult = {
  /** Newly invited: they get a notification. */
  invited: string[];
  /** Invited to this room before; nothing sent again. */
  alreadyInvited: string[];
  /** Not reached: they don't follow you with alerts on (or no such reader). */
  notReachable: string[];
};

/**
 * Invite readers to a room by @handle. Host or an assigned moderator only;
 * reaches only people who follow the caller with Chautari alerts on.
 */
export async function inviteToRoom(
  getToken: GetToken,
  slug: string,
  usernames: string[],
): Promise<InviteResult> {
  const res = await call<Partial<InviteResult>>(
    "/api/chautari/invite",
    { method: "POST", body: JSON.stringify({ slug, usernames }) },
    getToken,
  );
  return {
    invited: res.invited ?? [],
    alreadyInvited: res.alreadyInvited ?? [],
    notReachable: res.notReachable ?? [],
  };
}

/** Rooms the reader hosts or moderates, live or booked. */
export async function getMyRooms(getToken: GetToken): Promise<MyRoom[]> {
  const res = await call<{ rooms: MyRoom[] }>("/api/chautari/rooms/mine", { method: "GET" }, getToken);
  return res.rooms ?? [];
}

export async function endRoom(getToken: GetToken, slug: string): Promise<void> {
  await call(
    `/api/chautari/rooms?slug=${encodeURIComponent(slug)}`,
    { method: "DELETE" },
    getToken,
  );
}

/**
 * Ask for permission to join.
 *
 * The returned token expires in minutes, so this is called again on
 * reconnect rather than kept for the length of the broadcast.
 */
export async function requestJoin(
  getToken: GetToken,
  args: { roomSlug: string; displayName?: string | null },
): Promise<JoinGrant> {
  return call<JoinGrant>(
    "/api/chautari/token",
    { method: "POST", body: JSON.stringify(args) },
    getToken,
  );
}

/**
 * Raise or lower a hand. `visible` is whether the room was told: when true,
 * the hand arrives as a participant attribute; an older server omits it.
 */
export async function setHandRaised(
  getToken: GetToken,
  args: { roomSlug: string; raised: boolean; displayName?: string | null },
): Promise<{ visible: boolean }> {
  const res = await call<{ visible?: boolean }>(
    "/api/chautari/hand",
    { method: "POST", body: JSON.stringify(args) },
    getToken,
  );
  return { visible: res.visible === true };
}

export type ModerationAction =
  | "approve_speaker"
  | "deny_speaker"
  | "demote_speaker"
  | "mute"
  | "remove"
  | "make_moderator"
  | "remove_moderator";

export async function moderate(
  getToken: GetToken,
  args: { roomSlug: string; targetUserId: string; action: ModerationAction },
): Promise<{ role: RoomRole; applied: boolean }> {
  return call<{ role: RoomRole; applied: boolean }>(
    "/api/chautari/moderate",
    { method: "POST", body: JSON.stringify(args) },
    getToken,
  );
}
