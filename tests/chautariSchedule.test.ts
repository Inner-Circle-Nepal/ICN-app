import { describe, expect, it } from "vitest";

import {
  BOOKING_DAYS,
  bookingDays,
  bookingStamp,
  formatStartsIn,
  bookingSlots,
  formatBooking,
  formatCountdown,
} from "@/features/chautari/schedule";

// 2026-11-20 10:00 NPT (04:15 UTC).
const NOW = Date.parse("2026-11-20T04:15:00Z");

describe("booking slots", () => {
  it("are half-hourly NPT times, skipping anything within ten minutes", () => {
    const slots = bookingSlots("2026-11-20", NOW);
    // 10:00 is now and 10:00 + 10 min is too soon, so the first is 10:30.
    expect(slots[0]).toEqual({ iso: "2026-11-20T04:45:00.000Z", label: "10:30 AM" });
    expect(slots.at(-1)?.label).toBe("11:30 PM");
  });

  it("start at 6 AM on a later day", () => {
    const slots = bookingSlots("2026-11-21", NOW);
    expect(slots[0]).toEqual({ iso: "2026-11-21T00:15:00.000Z", label: "6:00 AM" });
    expect(slots).toHaveLength(36);
  });

  it("are empty for a day already over", () => {
    expect(bookingSlots("2026-11-19", NOW)).toEqual([]);
  });
});

describe("booking days", () => {
  it("label today and tomorrow, then dates, for two weeks", () => {
    const days = bookingDays(NOW);
    expect(days).toHaveLength(BOOKING_DAYS);
    expect(days[0]).toEqual({ key: "2026-11-20", label: "Today" });
    expect(days[1]).toEqual({ key: "2026-11-21", label: "Tomorrow" });
    expect(days[2].label).toBe("Sun, Nov 22");
  });

  it("drop today once its last slot has passed", () => {
    // 23:50 NPT.
    const late = Date.parse("2026-11-20T18:05:00Z");
    expect(bookingDays(late)[0].key).toBe("2026-11-21");
  });
});

describe("formatting", () => {
  it("reads a booking in NPT", () => {
    expect(formatBooking("2026-11-21T13:45:00Z")).toBe("Sat, Nov 21 · 7:30 PM NPT");
  });

  it("counts down coarsely far out and by the second in the last hour", () => {
    expect(formatCountdown(3 * 86_400_000 + 4 * 3_600_000)).toBe("3 d 4 h");
    expect(formatCountdown(2 * 3_600_000 + 15 * 60_000)).toBe("2 h 15 m");
    expect(formatCountdown(4 * 60_000 + 5_000)).toBe("4:05");
    expect(formatCountdown(0)).toBe("Starting soon");
  });
});

describe("card labels", () => {
  it("say how soon a room starts, in words that fit a card", () => {
    expect(formatStartsIn(30_000)).toBe("Starting soon");
    expect(formatStartsIn(34 * 60_000)).toBe("in 34 min");
    expect(formatStartsIn(2 * 3_600_000 + 15 * 60_000)).toBe("in 2 h 15 m");
    expect(formatStartsIn(3 * 3_600_000)).toBe("in 3 h");
    expect(formatStartsIn(3 * 86_400_000)).toBe("in 3 days");
  });

  it("stamp the day and time in NPT", () => {
    expect(bookingStamp("2026-11-21T13:45:00Z")).toEqual({ day: "SAT", time: "7:30 PM" });
  });
});
