import { z } from "zod";
import { FOREX } from "./symbols";
import type { AssetAdapter } from "./types";

// Forex vs USD — keyless, updates ~daily (price only, no % alerts).
const Resp = z.object({ result: z.string(), rates: z.record(z.number()) });

export const forex: AssetAdapter = {
  id: "forex",
  supports: (symbol) => FOREX.includes(symbol),

  async getPrice(symbol) {
    const quote = symbol.slice(3); // USD base, e.g. USDINR -> INR
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!r.ok) throw new Error(`forex getPrice ${symbol}: ${r.status}`);
    const data = Resp.parse(await r.json());
    const rate = data.rates[quote];
    if (rate == null) throw new Error(`forex: no rate for ${quote}`);
    return { symbol, price: rate, ts: Date.now() };
  },
};
