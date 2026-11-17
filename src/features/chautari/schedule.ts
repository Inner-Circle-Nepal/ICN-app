/**
 * Booking times for Chautari rooms, in Kathmandu time.
 *
 * The schedule is read in NPT everywhere in the app (the paper is based in
 * Kathmandu), so the picker offers NPT days and times too. NPT is UTC+5:45
 * with no daylight saving, which keeps the arithmetic a fixed offset.
 */

const NPT_OFFSET_MS = (5 * 60 + 45) * 60_000;

/** Earliest bookable slot, after now. The server needs at least five minutes. */
const LEAD_MS = 10 * 60_000;

export const BOOKING_DAYS = 14;

/** First and last slot of a day, and the step between them, in minutes. */
const FIRST_SLOT = 6 * 60;
const LAST_SLOT = 23 * 60 + 30;
const STEP = 30;

export type BookingDay = { key: string; label: string };
export type BookingSlot = { iso: string; label: string };

/** The NPT calendar date of an instant, as `YYYY-MM-DD`. */
function nptDateKey(ms: number): string {
  return new Date(ms + NPT_OFFSET_MS).toISOString().slice(0, 10);
}

function utcMsFor(dayKey: string, minutesIntoDay: number): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, minutesIntoDay) - NPT_OFFSET_MS;
}

const dayLabelFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kathmandu",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kathmandu",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** The next `BOOKING_DAYS` NPT days that still have a bookable slot. */
export function bookingDays(now: number = Date.now()): BookingDay[] {
  const days: BookingDay[] = [];
  for (let i = 0; i < BOOKING_DAYS + 1 && days.length < BOOKING_DAYS; i++) {
    const key = nptDateKey(now + i * 86_400_000);
    if (bookingSlots(key, now).length === 0) continue;
    const label =
      key === nptDateKey(now)
        ? "Today"
        : key === nptDateKey(now + 86_400_000)
          ? "Tomorrow"
          : dayLabelFmt.format(new Date(utcMsFor(key, 12 * 60)));
    days.push({ key, label });
  }
  return days;
}

/** Half-hour slots on an NPT day, from 6 AM, skipping anything too soon. */
export function bookingSlots(dayKey: string, now: number = Date.now()): BookingSlot[] {
  const slots: BookingSlot[] = [];
  for (let min = FIRST_SLOT; min <= LAST_SLOT; min += STEP) {
    const ms = utcMsFor(dayKey, min);
    if (ms < now + LEAD_MS) continue;
    slots.push({ iso: new Date(ms).toISOString(), label: timeFmt.format(new Date(ms)) });
  }
  return slots;
}

/** "Sat 22 Nov · 7:30 PM NPT". */
export function formatBooking(iso: string): string {
  const d = new Date(iso);
  return `${dayLabelFmt.format(d)} · ${timeFmt.format(d)} NPT`;
}

/**
 * Time left until a booking, for a countdown.
 *
 * Seconds tick only in the last hour; further out a ticking clock is noise.
 * Past the start time it reads "Starting soon": the room waits for its host.
 */
export function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "Starting soon";
  const totalSec = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${mins} m`;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/** "Starting soon", "in 34 min", "in 2 h 15 m", "in 3 days": for a card. */
export function formatStartsIn(msLeft: number): string {
  if (msLeft <= 60_000) return "Starting soon";
  const mins = Math.round(msLeft / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours} h${mins % 60 ? ` ${mins % 60} m` : ""}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

const stampDayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kathmandu",
  weekday: "short",
});

/** "SAT" and "7:30 PM", stacked on a card. NPT. */
export function bookingStamp(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return { day: stampDayFmt.format(d).toUpperCase(), time: timeFmt.format(d) };
}
