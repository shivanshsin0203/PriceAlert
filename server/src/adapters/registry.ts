import { binance } from "./binance";
import { forex } from "./forex";
import { goldApi } from "./gold-api";
import type { AssetAdapter, Candle, Quote } from "./types";
import { yahoo } from "./yahoo";

// The engine only talks to the registry, never a specific source (ARCHITECTURE.md §4).
const adapters: AssetAdapter[] = [binance, goldApi, forex, yahoo];

export function resolve(symbol: string): AssetAdapter {
  const a = adapters.find((x) => x.supports(symbol));
  if (!a) throw new Error(`No adapter supports symbol: ${symbol}`);
  return a;
}

export const getPrice = (symbol: string): Promise<Quote> => resolve(symbol).getPrice(symbol);

export function getHistory(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const a = resolve(symbol);
  if (!a.getHistory) throw new Error(`No history available for symbol: ${symbol}`);
  return a.getHistory(symbol, interval, limit);
}
