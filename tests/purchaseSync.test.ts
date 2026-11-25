import { describe, expect, it } from "vitest";

import {
  EMPTY_SYNC_STATE,
  SAFETY_SYNC_MS,
  parseSyncState,
  shouldSync,
} from "@/features/wallet/syncPolicy";

const NOW = 1_800_000_000_000;

describe("shouldSync", () => {
  it("syncs the first time on this phone", () => {
    expect(shouldSync(EMPTY_SYNC_STATE, NOW)).toBe(true);
  });

  it("syncs when a purchase wasn't confirmed, however recent the last sync", () => {
    expect(shouldSync({ unconfirmed: true, lastSyncAt: NOW - 1000 }, NOW)).toBe(true);
  });

  it("skips within a day of the last sync with nothing pending", () => {
    expect(shouldSync({ unconfirmed: false, lastSyncAt: NOW - 1000 }, NOW)).toBe(false);
    expect(shouldSync({ unconfirmed: false, lastSyncAt: NOW - SAFETY_SYNC_MS + 1 }, NOW)).toBe(false);
  });

  it("syncs once a day as a safety net", () => {
    expect(shouldSync({ unconfirmed: false, lastSyncAt: NOW - SAFETY_SYNC_MS }, NOW)).toBe(true);
  });

  it("treats a last sync in the future (clock moved back) as due", () => {
    expect(shouldSync({ unconfirmed: false, lastSyncAt: NOW + 60_000 }, NOW)).toBe(true);
  });
});

describe("parseSyncState", () => {
  it("reads what was stored", () => {
    expect(parseSyncState(JSON.stringify({ unconfirmed: true, lastSyncAt: NOW }))).toEqual({
      unconfirmed: true,
      lastSyncAt: NOW,
    });
  });

  it("falls back to empty for missing or damaged values", () => {
    expect(parseSyncState(null)).toEqual(EMPTY_SYNC_STATE);
    expect(parseSyncState("not json")).toEqual(EMPTY_SYNC_STATE);
    expect(parseSyncState(JSON.stringify({ unconfirmed: "yes", lastSyncAt: "soon" }))).toEqual(EMPTY_SYNC_STATE);
  });
});
