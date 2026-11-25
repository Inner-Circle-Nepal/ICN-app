import { describe, expect, it } from "vitest";

import { mergeMessages, normaliseMessage, type ChatMessage } from "@/features/chautari/chat";
import { GIFT_TOPIC, decodeGiftPacket, giftMessage } from "@/features/chautari/gifts";

const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

describe("decodeGiftPacket", () => {
  it("matches the server's topic", () => {
    expect(GIFT_TOPIC).toBe("chautari.gift");
  });

  it("reads a gift packet", () => {
    expect(
      decodeGiftPacket(encode({ type: "gift", giftId: "diyo", name: "Diyo", nameNe: "दियो", by: "Sita" })),
    ).toEqual({
      type: "gift",
      id: null,
      authorId: null,
      avatarUrl: null,
      sentAt: null,
      giftId: "diyo",
      name: "Diyo",
      nameNe: "दियो",
      by: "Sita",
    });
  });

  it("fills gaps instead of failing", () => {
    expect(decodeGiftPacket(encode({ type: "gift", giftId: "new_gift" }))).toEqual({
      type: "gift",
      id: null,
      authorId: null,
      avatarUrl: null,
      sentAt: null,
      giftId: "new_gift",
      name: "new_gift",
      nameNe: null,
      by: "A listener",
    });
  });

  it("rejects anything that isn't a gift", () => {
    expect(decodeGiftPacket(encode({ type: "effect", effect: "clap" }))).toBeNull();
    expect(decodeGiftPacket(encode({ type: "gift", giftId: "Bad Id!" }))).toBeNull();
    expect(decodeGiftPacket(new TextEncoder().encode("not json"))).toBeNull();
  });
});

describe("gifts in the chat", () => {
  const packet = {
    type: "gift" as const,
    id: "g1",
    authorId: "user_ram",
    avatarUrl: null,
    sentAt: "2026-11-25T10:00:00Z",
    giftId: "diyo",
    name: "Diyo",
    nameNe: "दियो",
    by: "Ram",
  };

  it("turns a live gift into a chat entry with the history's id", () => {
    expect(giftMessage(packet)).toEqual({
      id: "g1",
      authorId: "user_ram",
      name: "Ram",
      avatarUrl: null,
      role: "listener",
      text: "sent a Diyo",
      sentAt: "2026-11-25T10:00:00Z",
      gift: { giftId: "diyo", name: "Diyo", nameNe: "दियो" },
    });
  });

  it("skips the chat line for a packet from an older server", () => {
    expect(giftMessage({ ...packet, id: null })).toBeNull();
  });

  it("merges a live gift and its history copy into one entry", () => {
    const live = giftMessage(packet)!;
    expect(mergeMessages([live], [normaliseMessage({ ...live })])).toHaveLength(1);
  });

  it("drops a malformed gift field from history", () => {
    const bad = { ...giftMessage(packet)!, gift: { giftId: 3 } } as unknown as ChatMessage;
    expect(normaliseMessage(bad).gift).toBeUndefined();
  });
});
