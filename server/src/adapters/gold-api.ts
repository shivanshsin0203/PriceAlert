import { z } from "zod";
import { METALS } from "./symbols";
import type { AssetAdapter } from "./types";

// Metals — keyless real-time price. (History is paid → use Yahoo for metal charts.)
const Resp = z.object({ price: z.number(), symbol: z.string() });

export const goldApi: AssetAdapter = {
  id: "gold-api",
  supports: (symbol) => METALS.includes(symbol),

  async getPrice(symbol) {
    const r = await fetch(`https://api.gold-api.com/price/${symbol}`);
    if (!r.ok) throw new Error(`gold-api getPrice ${symbol}: ${r.status}`);
    const data = Resp.parse(await r.json());
    return { symbol, price: data.price, ts: Date.now() };
  },
};
