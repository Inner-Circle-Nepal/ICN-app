import type { SupabaseClient } from "@supabase/supabase-js";
import type { ForexRate } from "@/types/domain";
import { getPublicSupabase } from "./supabase";
import { ratesNeedRefresh } from "@/utils/format";

/**
 * Remittance / Forex rates from Supabase (`forex_rates`) with live fallback
 * to Nepal Rastra Bank (`https://www.nrb.org.np/api/forex/v1/rates`).
 *
 * Mirrors `site/src/lib/data/forex.ts` and `getForexRates` in `site/src/lib/data/queries.ts`.
 */

export const TRACKED_CURRENCIES: Record<string, { name: string; symbol: string }> = {
  USD: { name: "US Dollar", symbol: "$" },
  INR: { name: "Indian Rupee", symbol: "₹" },
  AUD: { name: "Australian Dollar", symbol: "A$" },
  GBP: { name: "Pound Sterling", symbol: "£" },
  EUR: { name: "Euro", symbol: "€" },
  AED: { name: "UAE Dirham", symbol: "د.إ" },
  QAR: { name: "Qatari Riyal", symbol: "﷼" },
  SAR: { name: "Saudi Riyal", symbol: "﷼" },
  JPY: { name: "Japanese Yen", symbol: "¥" },
  KRW: { name: "Korean Won", symbol: "₩" },
  CAD: { name: "Canadian Dollar", symbol: "C$" },
  MYR: { name: "Malaysian Ringgit", symbol: "RM" },
};

interface NrbRate {
  currency: { iso3: string; name: string; unit: number };
  buy: string;
  sell: string;
}

interface NrbDay {
  date: string;
  rates: NrbRate[];
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const RETRY_DELAYS_MS = [400, 1200];
const REQUEST_TIMEOUT_MS = 8000;

async function fetchNrbWithRetry(url: string): Promise<Response> {
  let lastError: Error = new Error("NRB request was never attempted");

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (res.ok) return res;

      lastError = new Error(`NRB responded ${res.status}`);
      if (res.status < 500) throw lastError;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.startsWith("NRB responded 4")) throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

export async function fetchNrbRates(): Promise<ForexRate[]> {
  const to = new Date();
  const from = new Date(to.getTime() - 12 * 24 * 60 * 60 * 1000);

  const url =
    `https://www.nrb.org.np/api/forex/v1/rates?from=${ymd(from)}&to=${ymd(to)}` +
    `&per_page=100&page=1`;

  const res = await fetchNrbWithRetry(url);
  const json = await res.json();
  const payload: NrbDay[] = json?.data?.payload ?? [];
  if (!payload.length) return [];

  const days = [...payload].sort((a, b) => a.date.localeCompare(b.date));
  const latest = days[days.length - 1];
  const previous = days.length > 1 ? days[days.length - 2] : null;

  const priorBuy = new Map<string, number>();
  for (const r of previous?.rates ?? []) {
    priorBuy.set(r.currency.iso3, Number.parseFloat(r.buy));
  }

  return latest.rates
    .filter((r) => r.currency.iso3 in TRACKED_CURRENCIES)
    .map((r) => {
      const meta = TRACKED_CURRENCIES[r.currency.iso3];
      const buy = Number.parseFloat(r.buy);
      const sell = Number.parseFloat(r.sell);
      const before = priorBuy.get(r.currency.iso3);

      const change =
        before && Number.isFinite(before) && before !== 0
          ? Number((((buy - before) / before) * 100).toFixed(2))
          : 0;

      return {
        code: r.currency.iso3,
        currency: meta.name,
        symbol: meta.symbol,
        buy,
        sell,
        unit: r.currency.unit || 1,
        change,
        updated_at: new Date(`${latest.date}T00:00:00Z`).toISOString(),
      };
    })
    .filter((r) => Number.isFinite(r.buy) && Number.isFinite(r.sell));
}

const FOREX_BASE = "currency, code, symbol, buy, sell, change, updated_at";

async function readStoredRates(
  sb: SupabaseClient,
): Promise<{ rows: ForexRate[]; degraded: boolean }> {
  const { data, error } = await sb
    .from("forex_rates")
    .select(`${FOREX_BASE}, unit`)
    .order("code");

  if (!error && data) {
    return {
      rows: (data as ForexRate[]).map((r) => ({
        ...r,
        buy: Number(r.buy),
        sell: Number(r.sell),
        change: Number(r.change),
        unit: Number(r.unit || 1),
      })),
      degraded: false,
    };
  }

  if (error && error.code !== "42703") {
    return { rows: [], degraded: false };
  }

  const { data: base, error: baseError } = await sb
    .from("forex_rates")
    .select(FOREX_BASE)
    .order("code");

  if (baseError || !base) return { rows: [], degraded: true };
  return {
    rows: base.map((r) => ({
      ...r,
      buy: Number(r.buy),
      sell: Number(r.sell),
      change: Number(r.change),
      unit: 1,
    })) as ForexRate[],
    degraded: true,
  };
}

export async function getForexRates(): Promise<ForexRate[]> {
  const sb = getPublicSupabase();
  const { rows: stored, degraded } = sb
    ? await readStoredRates(sb)
    : { rows: [] as ForexRate[], degraded: false };

  if (stored.length && !degraded && !ratesNeedRefresh(stored)) {
    return stored;
  }

  // On web browsers, nrb.org.np does not send Access-Control-Allow-Origin headers,
  // so use stored Supabase rows directly when available.
  if (typeof window !== "undefined" && typeof document !== "undefined" && stored.length) {
    return stored;
  }

  try {
    const live = await fetchNrbRates();
    if (live.length) return live;
  } catch {
    // Fall back to stored rows if NRB is unreachable
  }

  return degraded ? [] : stored;
}
