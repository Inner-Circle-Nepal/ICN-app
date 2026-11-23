// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the push-notification nudge state machine.
 *
 * The provider is pure state over AsyncStorage plus one bridge call to
 * `enablePushNotifications`. Both are mocked below, so the test drives
 * the real reducer logic — thresholds, cool-downs, decline limits, and
 * the "push on → never nudge" guard — without reaching react-native.
 *
 * This file matters because the timing scales involved (3 opens, 14 days,
 * 2 declines) do not fit a manual session — a bug like "14 days became
 * 14 hours" would ship unnoticed and only surface as puzzled user
 * reports weeks later.
 */

// Hoisted so the vi.mock factories below can close over them without
// hitting "cannot access before initialization" — vi.mock is lifted to
// the very top of the file, before any top-level `let`.
const h = vi.hoisted(() => ({
  store: {} as Record<string, string>,
  pushState: { enabled: false },
  allNewsState: { enabled: false },
  enableMock: vi.fn(async () => ({
    permission: "granted" as const,
    enabled: true,
    deviceToken: "fake-token",
    statusNote: null,
  })),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => h.store[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      h.store[key] = value;
    }),
    multiSet: vi.fn(async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) h.store[k] = v;
    }),
    removeItem: vi.fn(async (key: string) => {
      delete h.store[key];
    }),
  },
}));

vi.mock("@/lib/notifications/push", () => ({
  enablePushNotifications: h.enableMock,
  getPushNotificationState: vi.fn(async () => ({
    permission: h.pushState.enabled ? ("granted" as const) : ("undetermined" as const),
    enabled: h.pushState.enabled,
    deviceToken: h.pushState.enabled ? "fake-token" : null,
    statusNote: null,
  })),
  getAllNewsPushState: vi.fn(async () => ({
    enabled: h.allNewsState.enabled,
    statusNote: null,
  })),
}));

import { PushNudgeProvider, usePushNudge } from "@/features/pushNudge/context";

const KEYS = {
  articleCount: "icn-nudge-article-count",
  notificationsInteracted: "icn-nudge-notifications-interacted",
  lastShownAt: "icn-nudge-last-shown-at",
  declineCount: "icn-nudge-decline-count",
  silenced: "icn-nudge-silenced",
};

type Api = ReturnType<typeof usePushNudge>;

let api: Api;
let container: HTMLDivElement;
let root: Root;

function Probe() {
  api = usePushNudge();
  return null;
}

async function mount() {
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => {
    root.render(
      <PushNudgeProvider>
        <Probe />
      </PushNudgeProvider>,
    );
  });
  // One more flushed frame so the hydration effect's setStates land.
  await act(async () => {});
}

beforeEach(() => {
  h.store = {};
  h.pushState.enabled = false;
  h.allNewsState.enabled = false;
  h.enableMock.mockClear();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
});

describe("PushNudgeProvider — the Settings-tab dot", () => {
  it("shows when push is off and the reader has never engaged with a toggle", async () => {
    await mount();
    expect(api.showSettingsDot).toBe(true);
  });

  it("hides once any notification toggle has been flipped", async () => {
    await mount();
    await act(async () => {
      api.markNotificationsInteracted();
    });
    expect(api.showSettingsDot).toBe(false);
    expect(h.store[KEYS.notificationsInteracted]).toBe("true");
  });

  it("hides when push is already enabled even on a fresh install", async () => {
    h.pushState.enabled = true;
    await mount();
    expect(api.showSettingsDot).toBe(false);
  });

  it("stays hidden after interacting once, across remounts", async () => {
    h.store[KEYS.notificationsInteracted] = "true";
    await mount();
    expect(api.showSettingsDot).toBe(false);
  });

  it("accept-in-nudge-sheet counts as an interaction (so the dot clears from the sheet path too)", async () => {
    await mount();
    await act(async () => api.recordChautariOpen());
    await act(async () => {
      await api.acceptNudge();
    });
    expect(h.store[KEYS.notificationsInteracted]).toBe("true");
  });
});

describe("PushNudgeProvider — the article-count trigger", () => {
  it("does not open the sheet until the third article", async () => {
    await mount();
    await act(async () => api.recordArticleOpen());
    expect(api.pendingSheet).toBe(false);
    await act(async () => api.recordArticleOpen());
    expect(api.pendingSheet).toBe(false);
    await act(async () => api.recordArticleOpen());
    expect(api.pendingSheet).toBe(true);
  });

  it("persists the count across remounts so opens accumulate over sessions", async () => {
    h.store[KEYS.articleCount] = "2";
    await mount();
    await act(async () => api.recordArticleOpen());
    expect(api.pendingSheet).toBe(true);
    expect(h.store[KEYS.articleCount]).toBe("3");
  });

  it("never opens the sheet while All news is on, even with breaking off", async () => {
    h.allNewsState.enabled = true;
    await mount();
    for (let i = 0; i < 5; i += 1) {
      await act(async () => api.recordArticleOpen());
    }
    expect(api.pendingSheet).toBe(false);
    expect(api.showSettingsDot).toBe(false);
  });

  it("never opens the sheet while push is enabled, no matter how many articles", async () => {
    h.pushState.enabled = true;
    await mount();
    for (let i = 0; i < 5; i += 1) {
      await act(async () => api.recordArticleOpen());
    }
    expect(api.pendingSheet).toBe(false);
  });
});

describe("PushNudgeProvider — the Chautari fast-path", () => {
  it("opens the sheet on the first Chautari room, no threshold", async () => {
    await mount();
    await act(async () => api.recordChautariOpen());
    expect(api.pendingSheet).toBe(true);
  });

  it("is still gated by push being off", async () => {
    h.pushState.enabled = true;
    await mount();
    await act(async () => api.recordChautariOpen());
    expect(api.pendingSheet).toBe(false);
  });
});

describe("PushNudgeProvider — accept and decline", () => {
  it("accept triggers the real permission call and clears pending", async () => {
    await mount();
    await act(async () => api.recordChautariOpen());
    expect(api.pendingSheet).toBe(true);

    await act(async () => {
      await api.acceptNudge();
    });

    expect(h.enableMock).toHaveBeenCalledOnce();
    expect(api.pendingSheet).toBe(false);
    // Timestamp recorded so a later re-eligibility check sees the cool-down.
    expect(Number(h.store[KEYS.lastShownAt])).toBeGreaterThan(0);
  });

  it("decline increments the decline count and records a timestamp", async () => {
    await mount();
    await act(async () => api.recordChautariOpen());
    await act(async () => {
      await api.declineNudge();
    });

    expect(api.pendingSheet).toBe(false);
    expect(h.store[KEYS.declineCount]).toBe("1");
    expect(h.store[KEYS.silenced]).toBeUndefined();
    expect(Number(h.store[KEYS.lastShownAt])).toBeGreaterThan(0);
  });

  it("silences forever on the second decline", async () => {
    // First decline — pre-seed one in storage.
    h.store[KEYS.declineCount] = "1";
    // Pre-seed a last-shown-at outside the cool-down so the sheet CAN open.
    h.store[KEYS.lastShownAt] = String(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await mount();

    await act(async () => api.recordChautariOpen());
    expect(api.pendingSheet).toBe(true);

    await act(async () => {
      await api.declineNudge();
    });

    expect(h.store[KEYS.silenced]).toBe("true");
    expect(h.store[KEYS.declineCount]).toBe("2");

    // And now the sheet cannot be re-opened by any trigger.
    await act(async () => api.recordChautariOpen());
    expect(api.pendingSheet).toBe(false);
    for (let i = 0; i < 10; i += 1) {
      await act(async () => api.recordArticleOpen());
    }
    expect(api.pendingSheet).toBe(false);
  });
});

describe("PushNudgeProvider — the 14-day cool-down", () => {
  it("suppresses re-triggering inside the window", async () => {
    // Shown 13 days ago — still inside the 14-day cool-down.
    h.store[KEYS.lastShownAt] = String(Date.now() - 13 * 24 * 60 * 60 * 1000);
    await mount();
    await act(async () => api.recordChautariOpen());
    expect(api.pendingSheet).toBe(false);
  });

  it("allows re-triggering once the window has passed", async () => {
    // 15 days ago — outside the window.
    h.store[KEYS.lastShownAt] = String(Date.now() - 15 * 24 * 60 * 60 * 1000);
    await mount();
    await act(async () => api.recordChautariOpen());
    expect(api.pendingSheet).toBe(true);
  });
});
