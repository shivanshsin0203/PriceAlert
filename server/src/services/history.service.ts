import { getHistory } from "../adapters/registry";
import { cachedPrice } from "../cache/price";
import { redis } from "../cache/redis";
import type { Condition } from "../brain/schema";
import { plog } from "../lib/logger";
import type { AlertRow } from "../models/alerts.repo";

// Per-minute price series for an alert's card graph — fetched ON DEMAND from the
// provider's own history (Binance klines / Yahoo chart), never stored by us:
// every alert lives ≤24h, so the range is ≤1440 points (≈1-2 provider calls).
// Retroactive by design — full line the moment an alert is created.

export type HistoryPoint = { t: number; p: number }; // ms epoch, close price

export type AlertHistory = {
  series: HistoryPoint[];
  interval: "1m" | "5m";
  from: number; // chart window start (creation minus a short lead-in)
  to: number; // chart window end (now, or the moment the alert went terminal)
};

const LEAD_MS = 15 * 60_000; // show ~15min before creation so the "created" marker has context
const CACHE_SEC = 30; // re-opening a card shouldn't re-hit the provider
const MAX_1M_POINTS = 960; // beyond ~16h of minutes, drop to 5m candles (Binance cap is 1000/req)

export async function alertHistory(row: AlertRow): Promise<AlertHistory> {
  const key = `hist:${row.id}`;
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as AlertHistory;
  } catch {
    // cache is an optimization, not a dependency
  }

  const cond = row.condition as Condition;
  const createdAt = row.createdAt.getTime();
  const from = createdAt - LEAD_MS;
  // terminal alerts freeze at their end moment; active ones chart to "now"
  const to =
    row.status === "active"
      ? Date.now()
      : (row.triggeredAt?.getTime() ?? Math.min(Date.now(), row.expiresAt?.getTime() ?? Date.now()));

  const spanMin = Math.ceil((to - from) / 60_000);
  const interval = spanMin <= MAX_1M_POINTS ? "1m" : "5m";
  const limit = Math.min(1000, Math.ceil(spanMin / (interval === "1m" ? 1 : 5)) + 5);

  // Providers return the most recent N candles — clip to our window afterwards.
  // Padding for terminal alerts: (now - to) worth of extra candles so `to` is still covered.
  const staleMin = Math.ceil((Date.now() - to) / 60_000);
  const fetchLimit = Math.min(1000, limit + Math.ceil(staleMin / (interval === "1m" ? 1 : 5)));
  const candles = await getHistory(cond.symbol, interval, fetchLimit);
  const series: HistoryPoint[] = candles
    .filter((c) => c.t >= from && c.t <= to)
    .map((c) => ({ t: c.t, p: c.c }));

  // Live tail: for an active alert, end the line at the freshest engine price.
  if (row.status === "active") {
    const live = await cachedPrice(cond.symbol);
    if (live && (series.length === 0 || live.price !== series[series.length - 1].p)) {
      series.push({ t: Date.now(), p: live.price });
    }
  }

  const out: AlertHistory = { series, interval, from, to };
  redis.set(key, JSON.stringify(out), "EX", CACHE_SEC).catch(() => {});
  plog.queue(`history ${row.id.slice(0, 8)}: ${series.length} pts (${interval}) for ${cond.symbol}`);
  return out;
}
