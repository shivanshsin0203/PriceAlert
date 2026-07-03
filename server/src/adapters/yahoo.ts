import { z } from "zod";
import { fetchTimed } from "./http";
import { INDIA, INDIA_YAHOO, STOCKS } from "./symbols";
import type { AssetAdapter, Candle } from "./types";

// Keyless catch-all: US + Indian stocks, Nifty, oil + history. Unofficial/flaky from cloud IPs.
const MAP: Record<string, string> = {
  OIL: "CL=F",
  NIFTY: "^NSEI",
  GOLD: "GC=F",
  SILVER: "SI=F",
  ...Object.fromEntries(INDIA.map((s) => [s, `${INDIA_YAHOO[s] ?? s}.NS`])), // Indian stocks -> NSE
};
const toYahoo = (symbol: string) => MAP[symbol] ?? symbol;

const ChartResp = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({ regularMarketPrice: z.number() }),
          timestamp: z.array(z.number()).optional(),
          indicators: z
            .object({
              quote: z.array(
                z.object({
                  open: z.array(z.number().nullable()).optional(),
                  high: z.array(z.number().nullable()).optional(),
                  low: z.array(z.number().nullable()).optional(),
                  close: z.array(z.number().nullable()).optional(),
                }),
              ),
            })
            .optional(),
        }),
      )
      .nullable(),
  }),
});

async function fetchChart(symbol: string, interval: string, range: string) {
  const y = encodeURIComponent(toYahoo(symbol));
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${y}?interval=${interval}&range=${range}`;
  const r = await fetchTimed(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`yahoo ${symbol}: ${r.status}`);
  return ChartResp.parse(await r.json());
}

export const yahoo: AssetAdapter = {
  id: "yahoo",
  supports: (symbol) => symbol in MAP || STOCKS.includes(symbol),

  async getPrice(symbol) {
    const data = await fetchChart(symbol, "1d", "1d");
    const price = data.chart.result?.[0]?.meta.regularMarketPrice;
    if (price == null) throw new Error(`yahoo: no price for ${symbol}`);
    return { symbol, price, ts: Date.now() };
  },

  async getHistory(symbol, interval, limit) {
    const data = await fetchChart(symbol, interval, "5d");
    const res = data.chart.result?.[0];
    const q = res?.indicators?.quote?.[0];
    const ts = res?.timestamp ?? [];
    const out: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q?.open?.[i];
      const h = q?.high?.[i];
      const l = q?.low?.[i];
      const c = q?.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      out.push({ t: ts[i] * 1000, o, h, l, c });
    }
    return out.slice(-limit);
  },
};
