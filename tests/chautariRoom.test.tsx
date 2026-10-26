// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lifecycle tests for `useChautariRoom`.
 *
 * The hook renders nothing native — it owns a LiveKit `Room`, a phase machine
 * and a teardown — so it can be mounted with `react-dom` and driven directly,
 * the same way `bookmarksProvider.test.tsx` drives its provider.
 *
 * Only genuine external boundaries are replaced: `livekit-client` (a native
 * WebRTC stack), the platform audio session, and the one network call. The
 * lifecycle being tested is the real one.
 *
 * The test this file exists for is "leaving does not reconnect". The screen's
 * connect effect depended on the hook's returned object — new on every render
 * — and its guard was `phase === "idle"`, which `leave()` restored. A
 * deliberate exit therefore fired another token request, built another Room
 * and upserted another participant row on the server, every single time.
 */

/* ------------------------------------------------------------------ mocks */

type Handler = (...args: unknown[]) => void;

interface FakeParticipant {
  identity: string;
  name: string;
  isSpeaking: boolean;
  permissions: { canPublish: boolean };
  audioTrackPublications: Map<string, { isMuted: boolean }>;
  isMicrophoneEnabled: boolean;
  setMicrophoneEnabled: (on: boolean) => Promise<void>;
}

/*
 * Everything the `vi.mock` factories below reach for.
 *
 * `vi.mock` is hoisted above every `const` in the module, so a factory that
 * closed over an ordinary top-level binding would run before it existed
 * ("Cannot access 'audioStart' before initialization"). `vi.hoisted` is the
 * supported way to share a value with a factory.
 */
const h = vi.hoisted(() => {
  function participant(over: Partial<FakeParticipant> & { identity: string }): FakeParticipant {
    return {
      name: over.identity,
      isSpeaking: false,
      permissions: { canPublish: false },
      audioTrackPublications: new Map(),
      isMicrophoneEnabled: false,
      setMicrophoneEnabled: async () => {},
      ...over,
    };
  }

  /** A LiveKit Room, reduced to the surface this hook actually touches. */
  class FakeRoom {
    static instances: FakeRoom[] = [];
    static connectShouldThrow: Error | null = null;

    handlers = new Map<string, Handler[]>();
    localParticipant: FakeParticipant;
    remoteParticipants = new Map<string, FakeParticipant>();
    connect = vi.fn(async () => {
      if (FakeRoom.connectShouldThrow) throw FakeRoom.connectShouldThrow;
    });
    disconnect = vi.fn(async () => {});
    removeAllListeners = vi.fn(() => {
      this.handlers.clear();
    });

    constructor() {
      this.localParticipant = participant({ identity: "me", name: "Me" });
      FakeRoom.instances.push(this);
    }

    on(event: string, fn: Handler): this {
      const list = this.handlers.get(event) ?? [];
      list.push(fn);
      this.handlers.set(event, list);
      return this;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const fn of this.handlers.get(event) ?? []) fn(...args);
    }
  }

  return {
    audioStart: vi.fn(async () => {}),
    audioStop: vi.fn(async () => {}),
    requestJoin: vi.fn(),
    participant,
    FakeRoom,
    RoomEvent: {
      ParticipantConnected: "participantConnected",
      ParticipantDisconnected: "participantDisconnected",
      TrackPublished: "trackPublished",
      TrackUnpublished: "trackUnpublished",
      TrackMuted: "trackMuted",
      TrackUnmuted: "trackUnmuted",
      ActiveSpeakersChanged: "activeSpeakersChanged",
      LocalTrackPublished: "localTrackPublished",
      LocalTrackUnpublished: "localTrackUnpublished",
      ParticipantPermissionsChanged: "participantPermissionsChanged",
      Reconnecting: "reconnecting",
      Reconnected: "reconnected",
      Disconnected: "disconnected",
    },
    DisconnectReason: {
      UNKNOWN_REASON: 0,
      CLIENT_INITIATED: 1,
      DUPLICATE_IDENTITY: 2,
      SERVER_SHUTDOWN: 3,
      PARTICIPANT_REMOVED: 4,
      ROOM_DELETED: 5,
      STATE_MISMATCH: 6,
      SIGNAL_CLOSE: 9,
      ROOM_CLOSED: 10,
    },
    /* Mirrors livekit-client's own mapping closely enough to drive the branches. */
    MediaDeviceFailure: {
      PermissionDenied: "PermissionDenied",
      NotFound: "NotFound",
      DeviceInUse: "DeviceInUse",
      Other: "Other",
      getFailure(error: unknown): string | undefined {
        const name = (error as { name?: string } | null)?.name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError")
          return "PermissionDenied";
        if (name === "NotFoundError" || name === "DevicesNotFoundError") return "NotFound";
        if (name === "NotReadableError" || name === "TrackStartError") return "DeviceInUse";
        if (name) return "Other";
        return undefined;
      },
    },
  };
});

const { audioStart, audioStop, requestJoin, participant, FakeRoom, RoomEvent, DisconnectReason } = h;

vi.mock("@/lib/livekit/platform", () => ({
  isLiveKitAvailable: () => true,
  registerLiveKitGlobals: () => {},
  audioSession: { start: h.audioStart, stop: h.audioStop },
}));

vi.mock("livekit-client", () => ({
  Room: h.FakeRoom,
  RoomEvent: h.RoomEvent,
  DisconnectReason: h.DisconnectReason,
  MediaDeviceFailure: h.MediaDeviceFailure,
  ConnectionState: { Disconnected: "disconnected", Connected: "connected" },
}));

/* The one network call. `ChautariError` stays real — the hook branches on it. */
vi.mock("@/lib/api/chautari", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/chautari")>();
  return { ...actual, requestJoin: (...args: unknown[]) => h.requestJoin(...args) };
});

import {
  END_MESSAGES,
  useChautariRoom,
  type ChautariRoomState,
} from "@/features/chautari/useChautariRoom";
import { ChautariError } from "@/lib/api/chautari";

/* ----------------------------------------------------------------- harness */

let latest: ChautariRoomState | null = null;
let container: HTMLDivElement;
let root: Root;

function Probe({ slug, name }: { slug: string; name: string | null }) {
  latest = useChautariRoom(slug, async () => "clerk-token", name);
  return null;
}

function state(): ChautariRoomState {
  if (!latest) throw new Error("hook not mounted");
  return latest;
}

async function mount(slug = "budget-2082", name: string | null = "Reader") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Probe slug={slug} name={name} />);
  });
}

/** Re-render without changing props, as React does constantly in a real app. */
async function rerender(slug = "budget-2082", name: string | null = "Reader") {
  await act(async () => {
    root.render(<Probe slug={slug} name={name} />);
  });
}

async function unmount() {
  await act(async () => {
    root.unmount();
  });
  container.remove();
}

function grant(over: Record<string, unknown> = {}) {
  return {
    token: "lk-token",
    url: "wss://rtc.icn.news",
    identity: "user_me",
    role: "listener",
    canPublish: false,
    expiresInSeconds: 600,
    room: { slug: "budget-2082", title: "Budget 2082", status: "live" },
    ...over,
  };
}

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  latest = null;
  FakeRoom.instances = [];
  FakeRoom.connectShouldThrow = null;
  requestJoin.mockReset();
  requestJoin.mockResolvedValue(grant());
  audioStart.mockClear();
  audioStop.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------- tests */

describe("entering a room", () => {
  it("starts idle and does nothing on its own", async () => {
    await mount();
    expect(state().phase).toBe("idle");
    expect(requestJoin).not.toHaveBeenCalled();
    await unmount();
  });

  it("connects when asked, and reports what the server granted", async () => {
    requestJoin.mockResolvedValue(grant({ role: "speaker", canPublish: true }));
    await mount();

    await act(async () => state().connect());

    expect(requestJoin).toHaveBeenCalledTimes(1);
    expect(state().phase).toBe("connected");
    expect(state().role).toBe("speaker");
    expect(state().canPublish).toBe(true);
    // The room's own name, from the grant — not from anything the client said.
    expect(state().identity).toEqual({
      slug: "budget-2082",
      title: "Budget 2082",
      status: "live",
    });
    await unmount();
  });

  it("claims the audio route before connecting, not after", async () => {
    await mount();
    await act(async () => state().connect());

    const room = FakeRoom.instances[0];
    expect(audioStart).toHaveBeenCalled();
    expect(audioStart.mock.invocationCallOrder[0]).toBeLessThan(
      room.connect.mock.invocationCallOrder[0],
    );
    await unmount();
  });

  it("asks for a fresh token on every connect — a grant lives ten minutes", async () => {
    await mount();
    await act(async () => state().connect());
    await act(async () => state().leave());
    await act(async () => state().connect());
    expect(requestJoin).toHaveBeenCalledTimes(2);
    await unmount();
  });

  it("ignores a second connect while one is already in flight", async () => {
    let release!: (v: unknown) => void;
    requestJoin.mockReturnValue(new Promise((r) => (release = r)));
    await mount();

    await act(async () => {
      state().connect();
      state().connect();
      state().connect();
    });

    expect(requestJoin).toHaveBeenCalledTimes(1);
    await act(async () => release(grant()));
    await unmount();
  });
});

describe("leaving does not reconnect", () => {
  it("lands on the 'left' phase, not 'idle'", async () => {
    await mount();
    await act(async () => state().connect());
    await act(async () => state().leave());

    // "idle" is what the screen's auto-connect effect waits for. Leaving must
    // never look like arriving.
    expect(state().phase).toBe("left");
    await unmount();
  });

  it("issues no second token request across many re-renders after leaving", async () => {
    await mount();
    await act(async () => state().connect());
    expect(requestJoin).toHaveBeenCalledTimes(1);

    await act(async () => state().leave());
    for (let i = 0; i < 5; i++) await rerender();

    expect(requestJoin).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it("builds no second Room after leaving", async () => {
    await mount();
    await act(async () => state().connect());
    expect(FakeRoom.instances).toHaveLength(1);

    await act(async () => state().leave());
    await rerender();
    await rerender();

    expect(FakeRoom.instances).toHaveLength(1);
    await unmount();
  });

  it("keeps `connect` stable across renders, so an effect can depend on it", async () => {
    await mount();
    const before = state().connect;
    await act(async () => state().connect());
    await rerender();
    // Identity must survive the phase transitions connect() itself causes.
    expect(state().connect).toBe(before);
    await unmount();
  });

  it("disconnects the room and releases the audio route", async () => {
    await mount();
    await act(async () => state().connect());
    const room = FakeRoom.instances[0];

    await act(async () => state().leave());

    expect(room.removeAllListeners).toHaveBeenCalled();
    expect(room.disconnect).toHaveBeenCalled();
    expect(audioStop).toHaveBeenCalled();
    await unmount();
  });

  it("is safe to call repeatedly", async () => {
    await mount();
    await act(async () => state().connect());

    await act(async () => {
      state().leave();
      state().leave();
      state().leave();
    });

    expect(state().phase).toBe("left");
    expect(FakeRoom.instances).toHaveLength(1);
    await unmount();
  });

  it("clears the role and publishing grant", async () => {
    requestJoin.mockResolvedValue(grant({ role: "speaker", canPublish: true }));
    await mount();
    await act(async () => state().connect());
    await act(async () => state().leave());

    expect(state().role).toBeNull();
    expect(state().canPublish).toBe(false);
    expect(state().members).toEqual([]);
    await unmount();
  });

  it("lets a deliberate return connect again", async () => {
    await mount();
    await act(async () => state().connect());
    await act(async () => state().leave());
    await act(async () => state().connect());

    expect(state().phase).toBe("connected");
    expect(FakeRoom.instances).toHaveLength(2);
    await unmount();
  });

  /*
   * The phase is the only thing standing between a deliberate exit and an
   * automatic reconnect. A second flag was tried and removed — it was written
   * and never read, so it only made the real guard look optional. These
   * assert that every terminal phase still admits an explicit return.
   */
  it("admits an explicit connect from 'left'", async () => {
    await mount();
    await act(async () => state().connect());
    await act(async () => state().leave());
    expect(state().phase).toBe("left");

    await act(async () => state().connect());
    expect(state().phase).toBe("connected");
    await unmount();
  });

  it("admits an explicit connect from 'ended'", async () => {
    await mount();
    await act(async () => state().connect());
    await act(async () => {
      FakeRoom.instances[0].emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED);
    });
    expect(state().phase).toBe("ended");

    await act(async () => state().connect());
    expect(state().phase).toBe("connected");
    await unmount();
  });

  it("admits an explicit connect from 'error'", async () => {
    requestJoin.mockRejectedValueOnce(new ChautariError("x", "Nope.", 500));
    await mount();
    await act(async () => state().connect());
    expect(state().phase).toBe("error");

    requestJoin.mockResolvedValue(grant());
    await act(async () => state().connect());
    expect(state().phase).toBe("connected");
    await unmount();
  });
});

/**
 * The original bug, reproduced at the boundary where it actually happened.
 *
 * The hook alone cannot exhibit it — it took the screen's auto-connect effect
 * to close the loop. `AutoConnectProbe` is that effect, copied verbatim from
 * `app/chautari/[slug].tsx`, so these assertions fail if either half of the
 * fix is undone: the "left" phase, or the stable `connect` identity.
 */
function AutoConnectProbe({ slug }: { slug: string }) {
  const room = useChautariRoom(slug, async () => "clerk-token", "Reader");
  latest = room;
  const { phase, connect } = room;
  React.useEffect(() => {
    if (phase === "idle") connect();
  }, [phase, connect]);
  return null;
}

describe("the screen's auto-connect effect", () => {
  async function mountAuto() {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<AutoConnectProbe slug="budget-2082" />);
    });
  }

  it("connects on arrival, exactly once", async () => {
    await mountAuto();
    expect(requestJoin).toHaveBeenCalledTimes(1);
    expect(state().phase).toBe("connected");

    // Re-render repeatedly, as a real screen does.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        root.render(<AutoConnectProbe slug="budget-2082" />);
      });
    }
    expect(requestJoin).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it("does NOT reconnect after the user leaves", async () => {
    await mountAuto();
    expect(requestJoin).toHaveBeenCalledTimes(1);

    await act(async () => state().leave());
    // Several renders between `leave()` and the screen actually unmounting —
    // exactly the window the old code reconnected in.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        root.render(<AutoConnectProbe slug="budget-2082" />);
      });
    }

    expect(requestJoin).toHaveBeenCalledTimes(1);
    expect(FakeRoom.instances).toHaveLength(1);
    expect(state().phase).toBe("left");
    await unmount();
  });

  it("does not loop after a failure — the error phase is terminal until retry", async () => {
    requestJoin.mockRejectedValue(new ChautariError("room_full", "This room is full.", 409));
    await mountAuto();

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        root.render(<AutoConnectProbe slug="budget-2082" />);
      });
    }

    expect(requestJoin).toHaveBeenCalledTimes(1);
    expect(state().phase).toBe("error");
    await unmount();
  });
});

describe("a connection still in flight", () => {
  it("abandons a grant that arrives after the user left", async () => {
    let release!: (v: unknown) => void;
    requestJoin.mockReturnValue(new Promise((r) => (release = r)));

    await mount();
    await act(async () => state().connect());
    expect(state().phase).toBe("requesting");

    await act(async () => state().leave());
    // The token request was already in flight; its answer lands now.
    await act(async () => {
      release(grant());
      await Promise.resolve();
    });
    await flush();

    // No Room was built from a grant the user no longer wants.
    expect(FakeRoom.instances).toHaveLength(0);
    expect(state().phase).toBe("left");
    await unmount();
  });

  it("abandons a grant that arrives after unmount, without setting state", async () => {
    let release!: (v: unknown) => void;
    requestJoin.mockReturnValue(new Promise((r) => (release = r)));

    await mount();
    await act(async () => state().connect());
    await unmount();

    // Would warn or throw if the hook wrote state after unmount.
    await act(async () => {
      release(grant());
      await Promise.resolve();
    });

    expect(FakeRoom.instances).toHaveLength(0);
  });

  it("tears down on unmount so no microphone outlives the screen", async () => {
    await mount();
    await act(async () => state().connect());
    const room = FakeRoom.instances[0];

    await unmount();

    expect(room.disconnect).toHaveBeenCalled();
    expect(audioStop).toHaveBeenCalled();
  });
});

describe("failures", () => {
  it("surfaces the server's own reason for a refusal", async () => {
    requestJoin.mockRejectedValue(new ChautariError("room_full", "This room is full.", 409));
    await mount();
    await act(async () => state().connect());

    expect(state().phase).toBe("error");
    expect(state().error).toBe("This room is full.");
    await unmount();
  });

  it("does not leak a transport error's text to the reader", async () => {
    FakeRoom.connectShouldThrow = new Error("ICE failed: 10.0.0.1:3478 unreachable");
    await mount();
    await act(async () => state().connect());

    expect(state().phase).toBe("error");
    expect(state().error).not.toContain("10.0.0.1");
    await unmount();
  });

  it("retry tears down and connects again", async () => {
    requestJoin.mockRejectedValueOnce(new ChautariError("x", "Nope.", 500));
    await mount();
    await act(async () => state().connect());
    expect(state().phase).toBe("error");

    requestJoin.mockResolvedValue(grant());
    await act(async () => state().retry());
    await flush();

    expect(state().phase).toBe("connected");
    expect(state().error).toBeNull();
    await unmount();
  });
});

describe("how a room ends", () => {
  async function endWith(reason: number | undefined) {
    await mount();
    await act(async () => state().connect());
    await act(async () => {
      FakeRoom.instances[0].emit(RoomEvent.Disconnected, reason);
    });
  }

  it("names the host when the host closed the room", async () => {
    await endWith(DisconnectReason.ROOM_DELETED);
    expect(state().phase).toBe("ended");
    expect(state().endReason).toBe("host_ended");
    await unmount();
  });

  it("says so when a host removed this participant", async () => {
    await endWith(DisconnectReason.PARTICIPANT_REMOVED);
    expect(state().endReason).toBe("removed");
    await unmount();
  });

  it("calls a dropped signal a lost connection, not an ending", async () => {
    await endWith(DisconnectReason.SIGNAL_CLOSE);
    expect(state().endReason).toBe("connection_lost");
    await unmount();
  });

  /*
   * DUPLICATE_IDENTITY = 2 in @livekit/protocol 1.52.1: "another participant
   * with the same identity has joined the room". The identity is the user id,
   * so this is the same reader on a second device — the room is still running
   * and they are still welcome in it.
   */
  it("says the reader joined from another device, not that the room ended", async () => {
    await endWith(DisconnectReason.DUPLICATE_IDENTITY);
    expect(state().endReason).toBe("joined_elsewhere");
    await unmount();
  });

  it("never describes a duplicate identity as an ending or an unknown error", async () => {
    await endWith(DisconnectReason.DUPLICATE_IDENTITY);
    const copy = END_MESSAGES[state().endReason ?? "unknown"];
    expect(copy.title).not.toMatch(/ended/i);
    expect(copy.message).not.toMatch(/closed|lost for too long/i);
    expect(copy.message).toMatch(/another device|somewhere else/i);
    await unmount();
  });

  it("falls back to unknown when LiveKit gives no reason", async () => {
    await endWith(undefined);
    expect(state().endReason).toBe("unknown");
    await unmount();
  });

  it("does not show an ending screen for our own disconnect", async () => {
    // CLIENT_INITIATED is teardown completing. The user already knows.
    await mount();
    await act(async () => state().connect());
    await act(async () => state().leave());
    await act(async () => {
      FakeRoom.instances[0].emit(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED);
    });
    expect(state().phase).toBe("left");
    await unmount();
  });

  it("tracks reconnecting and recovery", async () => {
    await mount();
    await act(async () => state().connect());
    const room = FakeRoom.instances[0];

    await act(async () => room.emit(RoomEvent.Reconnecting));
    expect(state().phase).toBe("reconnecting");

    await act(async () => room.emit(RoomEvent.Reconnected));
    expect(state().phase).toBe("connected");
    await unmount();
  });
});

describe("participants", () => {
  async function connectedRoom() {
    await mount();
    await act(async () => state().connect());
    return FakeRoom.instances[0];
  }

  it("separates speakers from listeners by the server's permission", async () => {
    const room = await connectedRoom();
    room.remoteParticipants.set(
      "a",
      participant({ identity: "a", name: "Asha", permissions: { canPublish: true } }),
    );
    room.remoteParticipants.set("b", participant({ identity: "b", name: "Bikash" }));

    await act(async () => room.emit(RoomEvent.ParticipantConnected));

    const members = state().members;
    expect(members.find((m) => m.identity === "a")?.canPublish).toBe(true);
    expect(members.find((m) => m.identity === "b")?.canPublish).toBe(false);
    expect(state().listenerCount).toBe(2); // Bikash and the local listener.
    await unmount();
  });

  it("reports speaking only from LiveKit's own audio activity", async () => {
    const room = await connectedRoom();
    const asha = participant({
      identity: "a",
      name: "Asha",
      permissions: { canPublish: true },
      audioTrackPublications: new Map([["t", { isMuted: false }]]),
    });
    room.remoteParticipants.set("a", asha);

    await act(async () => room.emit(RoomEvent.ParticipantConnected));
    expect(state().members.find((m) => m.identity === "a")?.isSpeaking).toBe(false);

    asha.isSpeaking = true;
    await act(async () => room.emit(RoomEvent.ActiveSpeakersChanged));
    expect(state().members.find((m) => m.identity === "a")?.isSpeaking).toBe(true);
    await unmount();
  });

  it("treats a participant with no published track as muted", async () => {
    const room = await connectedRoom();
    room.remoteParticipants.set(
      "a",
      participant({ identity: "a", permissions: { canPublish: true } }),
    );
    await act(async () => room.emit(RoomEvent.ParticipantConnected));
    expect(state().members.find((m) => m.identity === "a")?.isMuted).toBe(true);
    await unmount();
  });

  /* What makes a memoised row able to skip a render. */
  it("keeps the object identity of anyone who did not change", async () => {
    const room = await connectedRoom();
    const asha = participant({
      identity: "a",
      name: "Asha",
      permissions: { canPublish: true },
      audioTrackPublications: new Map([["t", { isMuted: false }]]),
    });
    const bikash = participant({ identity: "b", name: "Bikash" });
    room.remoteParticipants.set("a", asha);
    room.remoteParticipants.set("b", bikash);
    await act(async () => room.emit(RoomEvent.ParticipantConnected));

    const before = state().members;
    const bikashBefore = before.find((m) => m.identity === "b");

    asha.isSpeaking = true;
    await act(async () => room.emit(RoomEvent.ActiveSpeakersChanged));

    const after = state().members;
    expect(after.find((m) => m.identity === "a")).not.toBe(before.find((m) => m.identity === "a"));
    // Bikash was not involved and must not be re-created.
    expect(after.find((m) => m.identity === "b")).toBe(bikashBefore);
    await unmount();
  });

  it("does not notify React at all when nothing changed", async () => {
    const room = await connectedRoom();
    room.remoteParticipants.set("a", participant({ identity: "a" }));
    await act(async () => room.emit(RoomEvent.ParticipantConnected));

    const before = state().members;
    // A speaker event that changes nothing — the common case in a quiet room.
    await act(async () => room.emit(RoomEvent.ActiveSpeakersChanged));
    expect(state().members).toBe(before);
    await unmount();
  });

  it("drops the mic grant the moment a host revokes it", async () => {
    requestJoin.mockResolvedValue(grant({ role: "speaker", canPublish: true }));
    const room = await connectedRoom();
    room.localParticipant.permissions = { canPublish: true };
    expect(state().canPublish).toBe(true);

    room.localParticipant.permissions = { canPublish: false };
    await act(async () => room.emit(RoomEvent.ParticipantPermissionsChanged));

    expect(state().canPublish).toBe(false);
    await unmount();
  });

  it("handles a crowded room without losing anyone", async () => {
    const room = await connectedRoom();
    for (let i = 0; i < 200; i++) {
      room.remoteParticipants.set(`p${i}`, participant({ identity: `p${i}` }));
    }
    await act(async () => room.emit(RoomEvent.ParticipantConnected));
    expect(state().members).toHaveLength(201); // 200 remote + local
    await unmount();
  });
});

describe("the microphone", () => {
  async function asSpeaker() {
    requestJoin.mockResolvedValue(grant({ role: "speaker", canPublish: true }));
    await mount();
    await act(async () => state().connect());
    const room = FakeRoom.instances[0];
    room.localParticipant.permissions = { canPublish: true };
    return room;
  }

  it("does nothing for a listener, whatever the UI asks", async () => {
    await mount();
    await act(async () => state().connect());
    const room = FakeRoom.instances[0];
    const spy = vi.spyOn(room.localParticipant, "setMicrophoneEnabled");

    await act(async () => state().toggleMic());

    expect(spy).not.toHaveBeenCalled();
    expect(state().micEnabled).toBe(false);
    await unmount();
  });

  it("turns on for a speaker", async () => {
    const room = await asSpeaker();
    room.localParticipant.setMicrophoneEnabled = vi.fn(async (on: boolean) => {
      room.localParticipant.isMicrophoneEnabled = on;
    });

    await act(async () => state().toggleMic());

    expect(state().micEnabled).toBe(true);
    expect(state().micError).toBeNull();
    await unmount();
  });

  /* The silent-revert bug: the button flipped back and said nothing. */
  it("explains a denied OS permission and offers Settings", async () => {
    const room = await asSpeaker();
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    room.localParticipant.setMicrophoneEnabled = vi.fn(async () => {
      throw denied;
    });

    await act(async () => state().toggleMic());
    await flush();

    expect(state().micEnabled).toBe(false);
    expect(state().micError).toContain("permission");
    expect(state().micBlocked).toBe(true);
    await unmount();
  });

  it("distinguishes a missing microphone from a blocked one", async () => {
    const room = await asSpeaker();
    room.localParticipant.setMicrophoneEnabled = vi.fn(async () => {
      throw Object.assign(new Error("none"), { name: "NotFoundError" });
    });

    await act(async () => state().toggleMic());
    await flush();

    expect(state().micError).toContain("No microphone");
    // Settings cannot fix absent hardware, so no Settings route is offered.
    expect(state().micBlocked).toBe(false);
    await unmount();
  });

  it("names the other app when the device is busy", async () => {
    const room = await asSpeaker();
    room.localParticipant.setMicrophoneEnabled = vi.fn(async () => {
      throw Object.assign(new Error("busy"), { name: "NotReadableError" });
    });

    await act(async () => state().toggleMic());
    await flush();

    expect(state().micError).toContain("another app");
    await unmount();
  });

  it("can be dismissed", async () => {
    const room = await asSpeaker();
    room.localParticipant.setMicrophoneEnabled = vi.fn(async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    });
    await act(async () => state().toggleMic());
    await flush();
    expect(state().micError).not.toBeNull();

    await act(async () => state().dismissMicError());

    expect(state().micError).toBeNull();
    expect(state().micBlocked).toBe(false);
    await unmount();
  });

  it("reports no error when merely muting fails", async () => {
    const room = await asSpeaker();
    room.localParticipant.isMicrophoneEnabled = true;
    room.localParticipant.setMicrophoneEnabled = vi.fn(async () => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    });

    // Turning OFF cannot be a permission problem worth explaining.
    await act(async () => state().toggleMic());
    await flush();

    expect(state().micError).toBeNull();
    await unmount();
  });
});
