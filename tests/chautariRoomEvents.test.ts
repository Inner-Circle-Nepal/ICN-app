import { describe, expect, it } from "vitest";

import { decodeRoomEvent } from "@/features/chautari/roomEvents";

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

describe("decodeRoomEvent", () => {
  it("reads a settings change", () => {
    expect(decodeRoomEvent(bytes({ type: "settings", inviteOnly: true, membersCanInvite: false }))).toEqual({
      type: "settings",
      inviteOnly: true,
      membersCanInvite: false,
    });
  });

  it("reads a join request, keeping only web pictures", () => {
    expect(
      decodeRoomEvent(
        bytes({ type: "join_request", requestId: "r1", name: " Ram ", username: "ram", avatarUrl: "https://x/y.jpg" }),
      ),
    ).toEqual({ type: "join_request", requestId: "r1", name: "Ram", username: "ram", avatarUrl: "https://x/y.jpg" });
    expect(
      decodeRoomEvent(bytes({ type: "join_request", requestId: "r1", avatarUrl: "file:///etc/passwd" })),
    ).toMatchObject({ name: "Someone", username: null, avatarUrl: null });
  });

  it("ignores anything malformed or unknown", () => {
    expect(decodeRoomEvent(bytes({ type: "settings", inviteOnly: "yes" }))).toBeNull();
    expect(decodeRoomEvent(bytes({ type: "join_request" }))).toBeNull();
    expect(decodeRoomEvent(bytes({ type: "something_else" }))).toBeNull();
    expect(decodeRoomEvent(new TextEncoder().encode("not json"))).toBeNull();
  });

  it("reads a list refresh", () => {
    expect(decodeRoomEvent(bytes({ type: "join_requests_changed" }))).toEqual({ type: "join_requests_changed" });
  });
});
