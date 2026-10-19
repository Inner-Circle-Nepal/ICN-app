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

export type RoomRole = "host" | "speaker" | "listener";
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

async function call<T>(
  path: string,
  init: RequestInit,
  getToken?: GetToken,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

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
  args: { title: string; description?: string; hostName?: string | null },
): Promise<{ slug: string; title: string }> {
  const res = await call<{ room: { slug: string; title: string } }>(
    "/api/chautari/rooms",
    { method: "POST", body: JSON.stringify(args) },
    getToken,
  );
  return res.room;
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

export async function setHandRaised(
  getToken: GetToken,
  args: { roomSlug: string; raised: boolean; displayName?: string | null },
): Promise<void> {
  await call("/api/chautari/hand", { method: "POST", body: JSON.stringify(args) }, getToken);
}

export type ModerationAction =
  | "approve_speaker"
  | "deny_speaker"
  | "demote_speaker"
  | "mute"
  | "remove";

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
