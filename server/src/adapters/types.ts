// A price data source. Add an asset = add one adapter (ARCHITECTURE.md §4/§10).
export interface Candle {
  t: number; // ms timestamp
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface Quote {
  symbol: string;
  price: number;
  ts: number; // ms
}

export interface AssetAdapter {
  id: string;
  supports(symbol: string): boolean;
  getPrice(symbol: string): Promise<Quote>;
  getHistory?(symbol: string, interval: string, limit: number): Promise<Candle[]>;
}
