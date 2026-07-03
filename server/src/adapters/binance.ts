import { z } from "zod";
import { fetchTimed } from "./http";
import { CRYPTO } from "./symbols";
import type { AssetAdapter, Candle } from "./types";

// Crypto — Binance, keyless, 24/7, full history. Everything priced in USDT (~USD).
const toBinance = (symbol: string) => `${symbol}USDT`;
const PriceResp = z.object({ symbol: z.string(), price: z.string() });

export const binance: AssetAdapter = {
  id: "binance",
  supports: (symbol) => CRYPTO.includes(symbol),

  async getPrice(symbol) {
    const r = await fetchTimed(`https://api.binance.com/api/v3/ticker/price?symbol=${toBinance(symbol)}`);
    if (!r.ok) throw new Error(`binance getPrice ${symbol}: ${r.status}`);
    const data = PriceResp.parse(await r.json());
    return { symbol, price: Number(data.price), ts: Date.now() };
  },

  async getHistory(symbol, interval, limit) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${toBinance(symbol)}&interval=${interval}&limit=${limit}`;
    const r = await fetchTimed(url);
    if (!r.ok) throw new Error(`binance getHistory ${symbol}: ${r.status}`);
    const raw = (await r.json()) as unknown[][];
    return raw.map(
      (k): Candle => ({
        t: Number(k[0]),
        o: Number(k[1]),
        h: Number(k[2]),
        l: Number(k[3]),
        c: Number(k[4]),
      }),
    );
  },
};
