// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `ActiveRoomProvider` keeps a Chautari connection alive outside the room
 * screen, so going Back no longer drops the reader out of the room.
 *
 * The room hook itself is covered by chautariRoom.test.tsx; here it is a fake
 * that records mounts, connects and leaves, so these tests are only about the
 * provider: who owns the connection, and when it ends.
 */

const h = vi.hoisted(() => {
  const rooms: { slug: string; phase: string; connect: ReturnType<typeof vi.fn>; leave: ReturnType<typeof vi.fn>; unmounted: boolean }[] = [];
  return { rooms, bgStart: vi.fn(), bgStop: vi.fn() };
});

vi.mock("@/lib/livekit/backgroundAudio", () => ({
  startBackgroundAudio: h.bgStart,
  stopBackgroundAudio: h.bgStop,
}));

vi.mock("@clerk/clerk-expo", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: async () => "t" }),
  useUser: () => ({ user: { fullName: "Asha" } }),
}));
vi.mock("@/constants/config", () => ({ isClerkConfigured: true }));
vi.mock("@/lib/livekit/platform", () => ({ isLiveKitAvailable: () => true }));

vi.mock("@/features/chautari/useChautariRoom", async () => {
  const R = await import("react");
  return {
    useChautariRoom: (slug: string) => {
      const [phase, setPhase] = R.useState("idle");
      const rec = R.useMemo(() => {
        const r = {
          slug,
          phase: "idle",
          connect: vi.fn(() => setPhase("connected")),
          leave: vi.fn(() => setPhase("left")),
          unmounted: false,
        };
        h.rooms.push(r);
        return r;
      }, [slug]);
      rec.phase = phase;
      R.useEffect(() => () => {
        rec.unmounted = true;
      }, [rec]);
      return { ...rec, phase, endPhase: (p: string) => setPhase(p) };
    },
  };
});

import { ActiveRoomProvider, useActiveRoom } from "@/features/chautari/ActiveRoom";

let api: ReturnType<typeof useActiveRoom>;
function Probe() {
  api = useActiveRoom();
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  h.rooms.length = 0;
  h.bgStart.mockClear();
  h.bgStop.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ActiveRoomProvider>
        <Probe />
      </ActiveRoomProvider>,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
});

const enter = (slug: string) =>
  act(async () => api.enter({ slug, hintedTitle: "Room", hintedHost: null }));

describe("ActiveRoomProvider", () => {
  it("joins on enter and publishes the room's state", async () => {
    await enter("a");
    expect(h.rooms).toHaveLength(1);
    expect(h.rooms[0].connect).toHaveBeenCalledTimes(1);
    expect(api.room?.phase).toBe("connected");
    expect(api.active?.slug).toBe("a");
  });

  it("keeps the same connection when the room screen is opened again", async () => {
    await enter("a");
    await enter("a"); // Back, then tap the mini bar: the screen asks again
    expect(h.rooms).toHaveLength(1);
    expect(h.rooms[0].unmounted).toBe(false);
    expect(h.rooms[0].connect).toHaveBeenCalledTimes(1);
  });

  it("leaves and drops the connection only on leave()", async () => {
    await enter("a");
    await act(async () => api.leave());
    expect(h.rooms[0].leave).toHaveBeenCalledTimes(1);
    expect(h.rooms[0].unmounted).toBe(true);
    expect(api.active).toBeNull();
    expect(api.room).toBeNull();
  });

  it("moving to another room ends the first", async () => {
    await enter("a");
    await enter("b");
    expect(h.rooms.map((r) => r.slug)).toEqual(["a", "b"]);
    expect(h.rooms[0].unmounted).toBe(true);
    expect(api.active?.slug).toBe("b");
  });

  it("re-entering a room that ended starts a fresh connection", async () => {
    await enter("a");
    await act(async () => (api.room as unknown as { endPhase: (p: string) => void }).endPhase("ended"));
    expect(api.room?.phase).toBe("ended");
    await enter("a");
    expect(h.rooms).toHaveLength(2);
    expect(h.rooms[0].unmounted).toBe(true);
    expect(api.room?.phase).toBe("connected");
  });

  it("keeps audio alive in the background while in the room, and stops it on leave", async () => {
    await enter("a");
    expect(h.bgStart).toHaveBeenCalledWith("Room", undefined);
    h.bgStop.mockClear();
    await act(async () => api.leave());
    expect(h.bgStop).toHaveBeenCalled();
  });
});
