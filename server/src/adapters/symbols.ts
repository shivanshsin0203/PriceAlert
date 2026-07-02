// Central symbol registry — single source of truth for adapters + brain.
export const CRYPTO = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE",
  "LTC", "LINK", "DOT", "AVAX", "TRX", "TON",
];
export const STOCKS = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO",
  "BRK-B", "LLY", "JPM", "V", "WMT", "MA", "NFLX",
];
// Indian stocks (NSE). Canonical symbol; ".NS" + overrides applied in the Yahoo adapter.
export const INDIA = [
  "RELIANCE", "TCS", "HDFCBANK", "BHARTIARTL", "ICICIBANK", "INFY", "SBIN", "ITC",
  "LT", "HINDUNILVR", "ZOMATO", "SWIGGY", "PAYTM", "NYKAA", "IRCTC",
];
export const INDIA_YAHOO: Record<string, string> = { ZOMATO: "ETERNAL" }; // canonical -> NSE ticker
export const INDICES = ["NIFTY"]; // Nifty 50 (India)
export const COMMODITIES = ["OIL"]; // WTI crude (Yahoo)
export const METALS = ["XAU", "XAG"]; // gold, silver — price only
export const FOREX = ["USDEUR", "USDINR", "USDJPY", "USDCNY", "USDSGD"]; // vs USD — price only

export const ALERTABLE = [...CRYPTO, ...STOCKS, ...INDIA, ...INDICES, ...COMMODITIES];
export const PRICEABLE = [...ALERTABLE, ...METALS, ...FOREX];

// Full display names — shown to the user instead of tickers.
export const NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP",
  ADA: "Cardano", DOGE: "Dogecoin", LTC: "Litecoin", LINK: "Chainlink",
  DOT: "Polkadot", AVAX: "Avalanche", TRX: "TRON", TON: "Toncoin",
  AAPL: "Apple", MSFT: "Microsoft", NVDA: "Nvidia", GOOGL: "Google", AMZN: "Amazon",
  META: "Meta", TSLA: "Tesla", AVGO: "Broadcom", "BRK-B": "Berkshire Hathaway",
  LLY: "Eli Lilly", JPM: "JPMorgan Chase", V: "Visa", WMT: "Walmart", MA: "Mastercard", NFLX: "Netflix",
  RELIANCE: "Reliance Industries", TCS: "Tata Consultancy Services", HDFCBANK: "HDFC Bank",
  BHARTIARTL: "Bharti Airtel", ICICIBANK: "ICICI Bank", INFY: "Infosys", SBIN: "State Bank of India",
  ITC: "ITC", LT: "Larsen & Toubro", HINDUNILVR: "Hindustan Unilever", ZOMATO: "Zomato",
  SWIGGY: "Swiggy", PAYTM: "Paytm", NYKAA: "Nykaa", IRCTC: "IRCTC",
  NIFTY: "Nifty 50", OIL: "Crude Oil", XAU: "Gold", XAG: "Silver",
  USDEUR: "USD → EUR", USDINR: "USD → INR", USDJPY: "USD → JPY", USDCNY: "USD → CNY", USDSGD: "USD → SGD",
};

export const nameOf = (s: string) => NAMES[s] ?? s;
// "Bitcoin (BTC)" for assets; just the name for forex pairs.
export const label = (s: string) => {
  const n = NAMES[s];
  if (!n) return s;
  return FOREX.includes(s) ? n : `${n} (${s})`;
};
