import { isMarketOpen } from "../adapters/market";
import { getPrice } from "../adapters/registry";
import { nameOf } from "../adapters/symbols";
import type { CreateAlertArgs } from "../brain/schema";
import { windowMinutes } from "../brain/schema";
import { fmtPrice } from "./format";
import { store, type StoredAlert } from "./store";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_WINDOW_MIN = 5; // watcher ticks ~1/min; shorter windows are meaningless

export type CreateResult =
  | { ok: true; alert: StoredAlert; current: number; note?: string }
  | { ok: false; current: number; reason: string };

// Create with live-price validation: reject conditions that are ALREADY TRUE
// (would fire immediately). For pct_change, the anchor = price at creation.
export async function createAlert(chatId: number, cond: CreateAlertArgs): Promise<CreateResult> {
  const { price: current } = await getPrice(cond.symbol);

  if (cond.kind === "pct_change") {
    if (windowMinutes(cond.window) < MIN_WINDOW_MIN) {
      return {
        ok: false,
        current,
        reason: `${nameOf(cond.symbol)}: that window is too short — I check prices about once a minute, so the minimum is ${MIN_WINDOW_MIN} minutes`,
      };
    }
    if (!isMarketOpen(cond.symbol)) {
      return {
        ok: false,
        current,
        reason: `${nameOf(cond.symbol)}'s market is closed right now, so a % move can't happen — the window would expire unused. Try during market hours, or use a price-level alert instead`,
      };
    }
  }

  if (cond.kind === "absolute") {
    const already = cond.op === "above" ? current >= cond.value : current <= cond.value;
    if (already) {
      return {
        ok: false,
        current,
        reason: `${nameOf(cond.symbol)} is already ${cond.op} ${fmtPrice(current, cond.symbol)} — an alert for ${cond.op} ${fmtPrice(cond.value, cond.symbol)} would fire immediately`,
      };
    }
  }

  const expiresAt =
    cond.kind === "pct_change"
      ? Date.now() + windowMinutes(cond.window) * 60_000 // window = the alert's lifetime
      : Date.now() + DAY_MS; // absolute: default 1-day expiry

  const alert = store.addAlert({ chatId, condition: cond, anchorPrice: current, createdAt: Date.now(), expiresAt });
  const note =
    cond.kind === "absolute" && !isMarketOpen(cond.symbol)
      ? `${nameOf(cond.symbol)}'s market is closed — the shown price is the last close; I'll evaluate once it reopens.`
      : undefined;
  return { ok: true, alert, current, note };
}

export const listAlerts = (chatId: number) => store.listAlerts(chatId);
export const deleteAlert = (chatId: number, id: number) => store.deleteAlert(chatId, id);
