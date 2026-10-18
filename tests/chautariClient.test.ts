import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChautariError,
  discoverRooms,
  endRoom,
  moderate,
  openRoom,
  requestJoin,
  setHandRaised,
} from "@/lib/api/chautari";

/**
 * The mobile side of Chautari.
 *
 * The property these exist to protect: the app holds no LiveKit credential,
 * no Supabase service key and no Clerk secret. It presents a session token
 * and is told what it may do. A regression here would be a microphone
 * credential shipped inside an APK.
 */

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
const token = async () => "clerk_session_token_abc";

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("where requests go, and what they carry", () => {
  it("talks to the newsroom, never to LiveKit", async () => {
    fetchMock.mockResolvedValue(
      reply({ ok: true, token: "t", url: "wss://x", role: "listener", canPublish: false }),
    );
    await requestJoin(token, { roomSlug: "r" });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toMatch(/\/api\/chautari\/token$/);
    expect(url).not.toContain("livekit");
    expect(url).not.toContain("supabase");
  });

  it("sends the Clerk session as a bearer token", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, token: "t", url: "wss://x" }));
    await requestJoin(token, { roomSlug: "r" });

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer clerk_session_token_abc");
  });

  it("carries no LiveKit or Supabase credential in any request", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, token: "t", url: "wss://x" }));
    await requestJoin(token, { roomSlug: "r" });

    const sent = JSON.stringify(fetchMock.mock.calls[0][1]);
    expect(sent).not.toMatch(/API[A-Za-z0-9]{10,}/); // LiveKit key shape
    expect(sent).not.toContain("service_role");
    expect(sent).not.toContain("sk_");
  });

  it("refuses to call a protected endpoint with no session", async () => {
    const noToken = async () => null;
    await expect(requestJoin(noToken, { roomSlug: "r" })).rejects.toMatchObject({
      reason: "not_signed_in",
    });
    // It must not even reach the network without a token.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("browses rooms without a session — discovery is public", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, rooms: [] }));
    await discoverRooms();

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });
});

describe("the join grant is read, never assumed", () => {
  it("passes the server's role and canPublish through unchanged", async () => {
    fetchMock.mockResolvedValue(
      reply({
        ok: true,
        token: "jwt",
        url: "wss://x.livekit.cloud",
        identity: "user_1",
        role: "listener",
        canPublish: false,
        expiresInSeconds: 600,
        room: { slug: "r", title: "T", status: "live" },
      }),
    );

    const grant = await requestJoin(token, { roomSlug: "r" });
    expect(grant.role).toBe("listener");
    expect(grant.canPublish).toBe(false);
    expect(grant.token).toBe("jwt");
  });
});

describe("failures", () => {
  it("surfaces the server's reason so the UI can explain itself", async () => {
    fetchMock.mockResolvedValue(
      reply({ ok: false, reason: "room_full", error: "This room is full." }, 409),
    );
    const err = await requestJoin(token, { roomSlug: "r" }).catch((e) => e);
    expect(err).toBeInstanceOf(ChautariError);
    expect(err.reason).toBe("room_full");
    expect(err.status).toBe(409);
  });

  it("distinguishes a refused host from a network problem", async () => {
    fetchMock.mockResolvedValue(
      reply({ ok: false, reason: "not_entitled_to_host", error: "No permission." }, 403),
    );
    const refused = await openRoom(token, { title: "T" }).catch((e) => e);
    expect(refused.reason).toBe("not_entitled_to_host");

    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    const offline = await openRoom(token, { title: "T" }).catch((e) => e);
    expect(offline.reason).toBe("offline");
  });

  it("treats a 200 with ok:false as a failure", async () => {
    fetchMock.mockResolvedValue(reply({ ok: false, error: "nope" }, 200));
    await expect(endRoom(token, "r")).rejects.toBeInstanceOf(ChautariError);
  });

  it("does not crash on a non-JSON body", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
    await expect(discoverRooms()).rejects.toBeInstanceOf(ChautariError);
  });
});

describe("request shapes", () => {
  it("raises and lowers a hand through one endpoint", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true }));
    await setHandRaised(token, { roomSlug: "r", raised: true });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      roomSlug: "r",
      raised: true,
    });

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(reply({ ok: true }));
    await setHandRaised(token, { roomSlug: "r", raised: false });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      raised: false,
    });
  });

  it("sends a moderation action with its target", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, role: "speaker", applied: true }));
    const res = await moderate(token, {
      roomSlug: "r",
      targetUserId: "user_2",
      action: "approve_speaker",
    });

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      roomSlug: "r",
      targetUserId: "user_2",
      action: "approve_speaker",
    });
    expect(res.role).toBe("speaker");
    expect(res.applied).toBe(true);
  });

  it("ends a room by slug in the query string, with DELETE", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true }));
    await endRoom(token, "budget debate");

    expect(String(fetchMock.mock.calls[0][0])).toContain("slug=budget%20debate");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
  });
});
