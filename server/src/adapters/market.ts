import { CRYPTO, FOREX, INDIA, METALS } from "./symbols";

// Get weekday + minutes-of-day in a timezone (no deps, via Intl).
function inTz(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), mins: Number(get("hour")) * 60 + Number(get("minute")) };
}

function withinHours(now: Date, tz: string, startMin: number, endMin: number) {
  const { weekday, mins } = inTz(now, tz);
  if (weekday === "Sat" || weekday === "Sun") return false;
  return mins >= startMin && mins <= endMin;
}

// Is this symbol's market open now? crypto/metals/forex ~always; stocks/indices are gated.
export function isMarketOpen(symbol: string, now = new Date()): boolean {
  if (CRYPTO.includes(symbol) || METALS.includes(symbol) || FOREX.includes(symbol)) return true;
  if (symbol === "NIFTY" || INDIA.includes(symbol)) return withinHours(now, "Asia/Kolkata", 9 * 60 + 15, 15 * 60 + 30); // NSE
  return withinHours(now, "America/New_York", 9 * 60 + 30, 16 * 60); // US stocks + OIL
}
