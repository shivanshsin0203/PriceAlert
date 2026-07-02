import { getPrice } from "../adapters/registry";

export type PriceResult = { symbol: string; price?: number; error?: string };

// Fetch live prices for one or more symbols (DB-free). Resilient per-symbol.
export async function getPrices(symbols: string[]): Promise<PriceResult[]> {
  return Promise.all(
    symbols.map(async (symbol) => {
      try {
        const q = await getPrice(symbol);
        return { symbol, price: q.price };
      } catch (e) {
        return { symbol, error: (e as Error).message };
      }
    }),
  );
}
