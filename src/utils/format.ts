import type { ForexRate } from "@/types/domain";
import { site } from "@/constants/site";

/**
 * Formatting helpers shared across the mobile application.
 *
 * Mirrors `site/src/lib/utils.ts`, `site/src/lib/forex-format.ts`, and
 * `site/src/lib/nepse-format.ts`.
 */

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dtf(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = dateFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-GB", options);
    } catch {
      const { timeZone: _tz, ...fallbackOptions } = options;
      f = new Intl.DateTimeFormat("en-GB", fallbackOptions);
    }
    dateFormatters.set(key, f);
  }
  return f;
}

/** "4 September 2026" — unambiguous for an audience spread across date conventions. */
export function formatDate(input: string | Date, timeZone?: string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  return dtf({ day: "numeric", month: "long", year: "numeric", timeZone }).format(date);
}

/** "4 Sep 2026, 14:30" */
export function formatDateTime(input: string | Date, timeZone?: string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  return dtf({
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

/** "3h ago" / "2d ago" — falls back to an absolute date past a week. */
export function timeAgo(input: string | Date, nowMs = Date.now()): string {
  const then = new Date(input).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((nowMs - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(input);
}

/** Current wall-clock time in a given IANA zone, for the masthead and edition clocks. */
export function clockIn(timeZone: string, date = new Date()): string {
  return dtf({ hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(date);
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

/**
 * Decode the HTML entities an article body can carry.
 *
 * Done in a single pass rather than a chain of `.replace()` calls. A chain
 * decodes its own output: `&amp;lt;` becomes `&lt;` on the first replacement
 * and then `<` on a later one, so a story quoting markup would have that
 * markup silently turn back into a tag. One pass consumes each entity exactly
 * once, which is also what a browser does.
 *
 * Numeric forms cover both decimal and hexadecimal (`&#x27;`), and resolve
 * through `fromCodePoint` so characters above the BMP — emoji, and some
 * Devanagari compositions — survive instead of becoming a replacement glyph.
 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(?:#(x[0-9a-f]+|\d+)|([a-z][a-z0-9]*));/gi,
    (whole, numeric: string | undefined, name: string | undefined) => {
      if (numeric) {
        const code = numeric[0].toLowerCase() === "x"
          ? Number.parseInt(numeric.slice(1), 16)
          : Number.parseInt(numeric, 10);
        if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole;
        // Lone surrogates are not valid scalar values and would throw.
        if (code >= 0xd800 && code <= 0xdfff) return whole;
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
      if (name) {
        const resolved = NAMED_ENTITIES[name.toLowerCase()];
        if (resolved !== undefined) return resolved;
      }
      return whole;
    },
  );
}

export function plainText(html: string, max = 300): string {
  const text = decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const lastSpace = text.lastIndexOf(" ", max - 1);
  return `${text.slice(0, lastSpace > 0 ? lastSpace : max - 1)}…`;
}

/** Canonical website path for an article (`/{category}/{slug}`). */
export function canonicalArticlePath(categorySlug: string, slug: string): string {
  return `/${categorySlug}/${slug}`;
}

/** Canonical public website URL for sharing (`https://icn.news/{category}/{slug}`). */
export function canonicalArticleUrl(categorySlug: string, slug: string): string {
  return `${site.url}${canonicalArticlePath(categorySlug, slug)}`;
}

/* -------------------------------------------------------------------------- */
/*  Forex / Remittance formatting                                              */
/* -------------------------------------------------------------------------- */

export const REFRESH_AFTER_DAYS = 1;
export const STALE_AFTER_DAYS = 10;

export function rateAgeInDays(rates: ForexRate[], now = Date.now()): number | null {
  const stamps = rates
    .map((r) => r.updated_at)
    .filter((s): s is string => Boolean(s))
    .sort();
  const latest = stamps[stamps.length - 1];
  if (!latest) return null;
  const ms = now - new Date(latest).getTime();
  return Math.floor(ms / 86_400_000);
}

export function ratesAreStale(rates: ForexRate[], now = Date.now()): boolean {
  const age = rateAgeInDays(rates, now);
  return age === null || age > STALE_AFTER_DAYS;
}

export function ratesNeedRefresh(rates: ForexRate[], now = Date.now()): boolean {
  const age = rateAgeInDays(rates, now);
  return age === null || age > REFRESH_AFTER_DAYS;
}

/**
 * NPR for one unit of a currency.
 * NRB quotes JPY per 10 and INR/KRW per 100.
 */
export function perUnit(rate: Pick<ForexRate, "buy" | "unit">): number {
  return rate.buy / (rate.unit || 1);
}

export function formatPerUnit(rate: Pick<ForexRate, "buy" | "unit">): string {
  const value = perUnit(rate);
  const digits = value < 1 ? 4 : 2;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/* -------------------------------------------------------------------------- */
/*  NEPSE formatting                                                           */
/* -------------------------------------------------------------------------- */

export function marketTimeLabel(generatedAt: string | null): string | null {
  if (!generatedAt) return null;
  const match = /T(\d{2}):(\d{2})/.exec(generatedAt);
  return match ? `${match[1]}:${match[2]} NPT` : null;
}

export function marketDateLabel(generatedAt: string | null): string | null {
  if (!generatedAt) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(generatedAt);
  if (!match) return null;

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;

  return `${Number(match[3])} ${months[monthIndex]}`;
}

export function isFromCurrentSession(
  generatedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!generatedAt) return false;
  const stamped = /^(\d{4}-\d{2}-\d{2})/.exec(generatedAt)?.[1];
  if (!stamped) return false;
  try {
    return stamped === now.toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });
  } catch {
    return false;
  }
}

export function formatRupees(value: number): string {
  if (!Number.isFinite(value)) return "—";

  const ARBA = 1_000_000_000;
  const CRORE = 10_000_000;
  const LAKH = 100_000;

  if (value >= ARBA) return `Rs ${(value / ARBA).toFixed(2)} arba`;
  if (value >= CRORE) return `Rs ${(value / CRORE).toFixed(2)} crore`;
  if (value >= LAKH) return `Rs ${(value / LAKH).toFixed(2)} lakh`;

  return `Rs ${Math.round(value).toLocaleString("en-US")}`;
}

export function formatCount(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "—";
}

export function formatPrice(value: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0.00%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}
