import { getPrice } from "../adapters/registry";
import { INDIA, label } from "../adapters/symbols";
import type { Condition } from "../brain/schema";

export type Currency = "USD" | "EUR" | "INR";

// What describeAlert needs to render a one-line summary (id-agnostic; numbering is the caller's job).
export type AlertView = { condition: Condition; anchorPrice: number; expiresAt: number };

// Native quote currency: Indian stocks trade in ₹, NIFTY is index points, everything else USD.
const CCY_SYM: Record<Currency, string> = { USD: "$", EUR: "€", INR: "₹" };
const rateCache = new Map<Currency, { rate: number; ts: number }>();

export async function usdRate(c: Currency): Promise<number> {
  if (c === "USD") return 1;
  const hit = rateCache.get(c);
  if (hit && Date.now() - hit.ts < 30 * 60_000) return hit.rate;
  const { price } = await getPrice(`USD${c}`);
  rateCache.set(c, { rate: price, ts: Date.now() });
  return price;
}

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 });

// Price in the asset's OWN quote currency (₹ Indian stocks · plain NIFTY points · $ otherwise).
export function fmtPrice(value: number, symbol: string): string {
  if (symbol === "NIFTY") return num(value);
  return `${INDIA.includes(symbol) ? "₹" : "$"}${num(value)}`;
}

export const fmtUsd = (n: number) => `$${num(n)}`;

// Dashboard display rule (user decision): USD-quoted assets shown in the user's SELECTED
// currency with the native USD in parens — the target was set in native, so it stays
// visible for comparison. Indian stocks / NIFTY are always native (₹ / index points).
export function displayPrice(value: number, symbol: string, c: Currency, rate: number): string {
  if (c === "USD" || symbol === "NIFTY" || INDIA.includes(symbol)) return fmtPrice(value, symbol);
  return `${CCY_SYM[c]}${num(value * rate)} ($${num(value)})`;
}

// For get_price: Indian stocks/NIFTY shown natively; USD assets optionally converted to display ccy.
export async function money(value: number, symbol: string, c: Currency): Promise<string> {
  if (symbol === "NIFTY" || INDIA.includes(symbol)) return fmtPrice(value, symbol);
  if (c === "USD") return `$${num(value)}`;
  try {
    const v = value * (await usdRate(c));
    return `${CCY_SYM[c]}${num(v)} ($${num(value)})`;
  } catch {
    return `$${num(value)}`;
  }
}

export function fmtRemaining(expiresAt: number): string {
  const mins = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
  return mins < 120 ? `${mins}m` : `${Math.round(mins / 60)}h`;
}

export function describeAlert(a: AlertView, seq?: number): string {
  const n = seq != null ? `#${seq} ` : "";
  const c = a.condition;
  if (c.kind === "absolute") {
    return `${n}${label(c.symbol)} ${c.op} ${fmtPrice(c.value, c.symbol)} · expires in ${fmtRemaining(a.expiresAt)}`;
  }
  const target = a.anchorPrice * (c.dir === "up" ? 1 + c.pct / 100 : 1 - c.pct / 100);
  const arrow = c.dir === "up" ? "+" : "−";
  const cmp = c.dir === "up" ? "≥" : "≤";
  return `${n}${label(c.symbol)} ${arrow}${c.pct}% in ${c.window.value}${c.window.unit} from ${fmtPrice(a.anchorPrice, c.symbol)} (fires ${cmp} ${fmtPrice(target, c.symbol)}) · expires in ${fmtRemaining(a.expiresAt)}`;
}
