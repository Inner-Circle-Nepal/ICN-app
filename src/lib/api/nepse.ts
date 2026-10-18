import type {
  NepseIndex,
  NepseIndexReading,
  NepseScrip,
  NepseSnapshot,
} from "@/types/domain";

/**
 * Nepal Stock Exchange (NEPSE) market figures.
 *
 * Mirrors `site/src/lib/data/nepse.ts`, querying the MIT-licensed YoNEPSE
 * dataset across both mirrors and selecting whichever carries the freshest
 * `generatedTime`.
 */

const SOURCES = [
  "https://raw.githubusercontent.com/shubhamnpk/yonepse/main/data/market",
  "https://shubhamnpk.github.io/yonepse/data/market",
];

const REQUEST_TIMEOUT_MS = 8000;

interface RawIndex {
  index: string;
  close: number;
  change: number;
  perChange: number;
  generatedTime?: string | null;
}

interface RawScrip {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  percent_change: number;
  volume: number;
  turnover: number;
}

interface RawSummaryRow {
  detail: string;
  value: number;
}

async function fetchJson<T>(base: string, path: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickHeadlineIndex(indices: RawIndex[] | null): NepseIndex | null {
  if (!Array.isArray(indices)) return null;

  const match =
    indices.find((i) => i?.index?.trim().toLowerCase() === "nepse index") ?? null;

  if (!match || !Number.isFinite(match.close)) return null;

  return {
    name: match.index,
    close: match.close,
    change: Number.isFinite(match.change) ? match.change : 0,
    percentChange: Number.isFinite(match.perChange) ? match.perChange : 0,
    generatedAt: match.generatedTime ?? null,
  };
}

async function freshestSource(): Promise<{ base: string; indices: RawIndex[] | null }> {
  const candidates = await Promise.all(
    SOURCES.map(async (base) => {
      const indices = await fetchJson<RawIndex[]>(base, "indices.json");
      return { base, indices, stamp: pickHeadlineIndex(indices)?.generatedAt ?? "" };
    }),
  );

  const best = candidates.reduce((a, b) => (b.stamp > a.stamp ? b : a));
  return { base: best.base, indices: best.indices };
}

export async function getNepseIndex(): Promise<NepseIndexReading> {
  const { base, indices } = await freshestSource();
  const status = await fetchJson<{ is_open?: boolean }>(base, "status.json");

  return {
    index: pickHeadlineIndex(indices),
    isOpen: Boolean(status?.is_open),
  };
}

export async function getNepseSnapshot(): Promise<NepseSnapshot> {
  const { base, indices } = await freshestSource();
  const [status, summary, live] = await Promise.all([
    fetchJson<{ is_open?: boolean }>(base, "status.json"),
    fetchJson<RawSummaryRow[]>(base, "summary.json"),
    fetchJson<RawScrip[]>(base, "live.json"),
  ]);

  const scrips = (Array.isArray(live) ? live : [])
    .filter(
      (s) =>
        s &&
        typeof s.symbol === "string" &&
        Number.isFinite(s.ltp) &&
        Number.isFinite(s.percent_change),
    )
    .map(
      (s): NepseScrip => ({
        symbol: s.symbol,
        name: s.name ?? s.symbol,
        ltp: s.ltp,
        change: s.change ?? 0,
        percentChange: s.percent_change,
        volume: s.volume ?? 0,
        turnover: s.turnover ?? 0,
      }),
    );

  const traded = scrips.filter((s) => s.volume > 0);
  const byChange = [...traded].sort((a, b) => b.percentChange - a.percentChange);

  return {
    index: pickHeadlineIndex(indices),
    isOpen: Boolean(status?.is_open),
    summary: (Array.isArray(summary) ? summary : [])
      .filter((r) => r && typeof r.detail === "string" && Number.isFinite(r.value))
      .map((r) => ({ label: r.detail.replace(/:$/, ""), value: r.value })),
    gainers: byChange.slice(0, 5),
    losers: byChange.slice(-5).reverse(),
    mostTraded: [...traded].sort((a, b) => b.turnover - a.turnover).slice(0, 5),
    scripCount: scrips.length,
  };
}
