import { getPrice } from "../adapters/registry";
import { plog } from "../lib/logger";
import { redis } from "./redis";

// Shared price cache (ARCHITECTURE.md §9): price:{symbol}, ~45s TTL.
// 3 BTC alerts in one tick = 1 fetch. A fetch failure returns null — callers skip and retry next tick.

const TTL_SEC = 45;

export async function cachedPrice(symbol: string): Promise<{ price: number; cached: boolean } | null> {
  const k = `price:${symbol}`;
  try {
    const hit = await redis.get(k);
    if (hit != null) return { price: Number(hit), cached: true };
  } catch {
    // Redis hiccup — fall through to a direct fetch; the cache is an optimization, not a dependency
  }
  try {
    const { price } = await getPrice(symbol);
    redis.set(k, String(price), "EX", TTL_SEC).catch(() => {});
    return { price, cached: false };
  } catch (e) {
    plog.warn(`price: ${symbol} fetch failed — ${(e as Error).message}`);
    return null;
  }
}
