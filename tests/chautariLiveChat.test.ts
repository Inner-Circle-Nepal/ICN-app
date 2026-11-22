import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAT_KEEP,
  CHAT_TOPIC,
  applyChatPacket,
  canRemoveMessage,
  charsLeft,
  decodeChatPacket,
  mergeMessages,
  type ChatMessage,
} from "@/features/chautari/chat";
import { ChautariError, deleteChat, getChat, sendChat } from "@/lib/api/chautari";

/**
 * Chautari live chat. The app never broadcasts: it posts to the server and
 * merges what the server pushes back. These cover that merge and the calls.
 */

const msg = (id: string, at: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  authorId: "u1",
  name: "Sita",
  avatarUrl: null,
  role: "listener",
  text: `message ${id}`,
  sentAt: at,
  ...over,
});

const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

describe("decodeChatPacket", () => {
  it("reads message and delete packets", () => {
    const m = msg("a", "2026-11-22T10:00:00Z");
    expect(decodeChatPacket(encode({ type: "message", message: m }))).toEqual({
      type: "message",
      message: m,
    });
    expect(decodeChatPacket(encode({ type: "delete", id: "a" }))).toEqual({ type: "delete", id: "a" });
  });

  it("ignores anything else instead of throwing", () => {
    expect(decodeChatPacket(new TextEncoder().encode("not json"))).toBeNull();
    expect(decodeChatPacket(encode({ type: "message", message: { id: 1 } }))).toBeNull();
    expect(decodeChatPacket(encode({ type: "reaction", id: "a" }))).toBeNull();
  });

  it("uses the topic the server sends on", () => {
    expect(CHAT_TOPIC).toBe("chautari.chat");
  });
});

describe("mergeMessages / applyChatPacket", () => {
  it("dedupes the send response against the broadcast of the same message", () => {
    const m = msg("a", "2026-11-22T10:00:00Z");
    expect(mergeMessages([m], [m])).toEqual([m]);
  });

  it("orders by send time, whatever order they arrive in", () => {
    const late = msg("b", "2026-11-22T10:05:00Z");
    const early = msg("a", "2026-11-22T10:00:00Z");
    expect(mergeMessages([late], [early]).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("keeps only the newest CHAT_KEEP", () => {
    const many = Array.from({ length: CHAT_KEEP + 5 }, (_, i) =>
      msg(`m${i}`, new Date(Date.UTC(2026, 10, 22, 10, 0, i)).toISOString()),
    );
    const kept = mergeMessages([], many);
    expect(kept).toHaveLength(CHAT_KEEP);
    expect(kept[0].id).toBe("m5");
  });

  it("drops a deleted message", () => {
    const list = [msg("a", "2026-11-22T10:00:00Z"), msg("b", "2026-11-22T10:01:00Z")];
    expect(applyChatPacket(list, { type: "delete", id: "a" }).map((m) => m.id)).toEqual(["b"]);
  });
});

describe("canRemoveMessage", () => {
  const m = msg("a", "2026-11-22T10:00:00Z", { authorId: "author" });
  it("offers removal to the host, moderators and the author", () => {
    expect(canRemoveMessage({ message: m, myId: "h", myRole: "host" })).toBe(true);
    expect(canRemoveMessage({ message: m, myId: "x", myRole: "moderator" })).toBe(true);
    expect(canRemoveMessage({ message: m, myId: "author", myRole: "listener" })).toBe(true);
  });
  it("not to other readers, or when signed out", () => {
    expect(canRemoveMessage({ message: m, myId: "x", myRole: "speaker" })).toBe(false);
    expect(canRemoveMessage({ message: m, myId: null, myRole: null })).toBe(false);
  });
});

it("counts emoji as one character", () => {
  expect(charsLeft("🙏🙏")).toBe(298);
});

/* -------------------------------------------------------------- calls */

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

describe("chat API calls", () => {
  it("reads history without a session", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, messages: [], open: true }));
    await getChat("tea talk");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/chautari/chat?roomSlug=tea%20talk");
    expect((init as RequestInit).headers).not.toHaveProperty("authorization");
  });

  it("sends with the session and returns the stored message", async () => {
    const m = msg("a", "2026-11-22T10:00:00Z");
    fetchMock.mockResolvedValue(reply({ ok: true, message: m, delivered: true }));
    await expect(sendChat(token, "r", "hello")).resolves.toEqual(m);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ roomSlug: "r", text: "hello" });
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer clerk_session_token_abc",
    });
  });

  it("surfaces the server's refusal reason", async () => {
    fetchMock.mockResolvedValue(
      reply({ ok: false, reason: "not_in_room", error: "Join the room to chat." }, 403),
    );
    const err = await sendChat(token, "r", "hello").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChautariError);
    expect((err as ChautariError).reason).toBe("not_in_room");
  });

  it("deletes with DELETE and the message id", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, id: "a" }));
    await deleteChat(token, "r", "a");
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe("DELETE");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ roomSlug: "r", messageId: "a" });
  });
});

/* ------------------------------------------------------ sound effects */

import { EFFECT_TOPIC, decodeEffectPacket } from "@/features/chautari/effects";
import { playRoomEffect } from "@/lib/api/chautari";

describe("applause packets", () => {
  it("reads a clap with who triggered it", () => {
    expect(decodeEffectPacket(encode({ type: "effect", effect: "clap", by: "Sita" }))).toEqual({
      type: "effect",
      effect: "clap",
      by: "Sita",
    });
    expect(EFFECT_TOPIC).toBe("chautari.effect");
  });

  it("falls back to a neutral name, and ignores unknown effects", () => {
    expect(decodeEffectPacket(encode({ type: "effect", effect: "clap" }))?.by).toBe("The host");
    expect(decodeEffectPacket(encode({ type: "effect", effect: "airhorn", by: "x" }))).toBeNull();
    expect(decodeEffectPacket(new TextEncoder().encode("nope"))).toBeNull();
  });

  it("asks the server to play it, with the session", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, delivered: true }));
    await playRoomEffect(token, "r", "clap");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/chautari/effect");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ roomSlug: "r", effect: "clap" });
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer clerk_session_token_abc",
    });
  });
});
