import { isMarketOpen } from "../adapters/market";
import { getPrice } from "../adapters/registry";
import { nameOf } from "../adapters/symbols";
import { addActive, removeActive, type HotAlert } from "../cache/active";
import type { Condition } from "../brain/schema";
import { windowMinutes } from "../brain/schema";
import { plog } from "../lib/logger";
import { cancelAlert, insertAlert, listActiveByUser, loadActiveWithChat, type AlertRow } from "../models/alerts.repo";
import type { BotUser } from "../models/users.repo";
import { fmtPrice } from "./format";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_WINDOW_MIN = 5; // watcher ticks ~1/min; shorter windows are meaningless

export type AlertItem = { id: string; condition: Condition; anchorPrice: number; expiresAt: number };

export type CreateResult =
  | { ok: true; alert: AlertItem; current: number; note?: string }
  | { ok: false; reason: string };

const rowToItem = (row: AlertRow): AlertItem => ({
  id: row.id,
  condition: row.condition as Condition,
  anchorPrice: Number((row.evalState as { anchorPrice?: number })?.anchorPrice ?? 0),
  expiresAt: row.expiresAt ? row.expiresAt.getTime() : Date.now() + DAY_MS,
});

// Create with live-price validation (guards unchanged), then PG (truth) → Redis (hot).
// Every failure path returns a specific, friendly reason — the bot never goes silent.
export async function createAlert(user: BotUser, cond: Condition): Promise<CreateResult> {
  // 1) live price — required to validate and to anchor pct_change
  let current: number;
  try {
    current = (await getPrice(cond.symbol)).price;
  } catch {
    return {
      ok: false,
      reason: `I couldn't reach ${nameOf(cond.symbol)}'s price source just now, and I need the live price to set this alert safely. Try again in a minute`,
    };
  }

  // 2) guards
  if (cond.kind === "pct_change") {
    if (windowMinutes(cond.window) < MIN_WINDOW_MIN) {
      return {
        ok: false,
        reason: `that window is too short — I check prices about once a minute, so the minimum is ${MIN_WINDOW_MIN} minutes`,
      };
    }
    if (!isMarketOpen(cond.symbol)) {
      return {
        ok: false,
        reason: `the market is closed right now, so a % move can't happen — the window would expire unused. Try during market hours, or use a price-level alert instead`,
      };
    }
  }
  if (cond.kind === "absolute") {
    const already = cond.op === "above" ? current >= cond.value : current <= cond.value;
    if (already) {
      return {
        ok: false,
        reason: `it's already ${cond.op === "above" ? "above" : "below"} that — now at ${fmtPrice(current, cond.symbol)}, so an alert for ${cond.op} ${fmtPrice(cond.value, cond.symbol)} would fire immediately`,
      };
    }
  }

  const expiresAt =
    cond.kind === "pct_change"
      ? new Date(Date.now() + windowMinutes(cond.window) * 60_000) // window = lifetime
      : new Date(Date.now() + DAY_MS); // absolute: 1-day expiry

  // 3) Postgres — the durable truth. Fail here = clean abort, nothing was created.
  let row: AlertRow;
  try {
    row = await insertAlert({ userId: user.userId, condition: cond, anchorPrice: current, expiresAt });
    plog.pg(`alert ${row.id.slice(0, 8)} saved (${cond.symbol} ${cond.kind}) for user ${user.userId.slice(0, 8)}`);
  } catch (e) {
    plog.error(`create: PG insert failed — ${(e as Error).message}`);
    return {
      ok: false,
      reason: `I validated everything but couldn't save it (database hiccup) — nothing was created. Please send it again in a moment`,
    };
  }

  // 4) Redis hot copy. Fail here ≠ lost alert (PG has it; rehydrate heals) — just delayed watching.
  const hot: HotAlert = {
    id: row.id,
    userId: user.userId,
    chatId: user.chatId,
    condition: cond,
    anchorPrice: current,
    createdAt: row.createdAt.getTime(),
    expiresAt: expiresAt.getTime(),
  };
  let note: string | undefined;
  try {
    await addActive(hot);
    plog.redis(`alert ${row.id.slice(0, 8)} added to active set (expires ${expiresAt.toLocaleTimeString("en-GB")})`);
  } catch (e) {
    plog.error(`create: Redis add failed — ${(e as Error).message} (alert is saved; rehydrate will pick it up)`);
    note = "Saved — but my watcher cache is briefly unavailable, so monitoring may start with a short delay.";
  }

  const noteMarket =
    cond.kind === "absolute" && !isMarketOpen(cond.symbol)
      ? `${nameOf(cond.symbol)}'s market is closed — the shown price is the last close; I'll evaluate once it reopens.`
      : undefined;
  return { ok: true, alert: rowToItem(row), current, note: note ?? noteMarket };
}

export async function listAlerts(userId: string): Promise<AlertItem[]> {
  return (await listActiveByUser(userId)).map(rowToItem);
}

export async function deleteAlert(userId: string, alertId: string): Promise<boolean> {
  const ok = await cancelAlert(alertId, userId);
  if (ok) {
    await removeActive(alertId).catch((e) => plog.warn(`delete: Redis cleanup failed — ${(e as Error).message}`));
    plog.pg(`alert ${alertId.slice(0, 8)} cancelled`);
  }
  return ok;
}

// ── Redis ↔ PG reconciliation (ARCHITECTURE.md §9 "rehydrate") ──

// On boot / reconnect: repopulate the hot set from every PG row with status='active'.
export async function rehydrateActive(): Promise<number> {
  const rows = await loadActiveWithChat();
  for (const { alert, chatId } of rows) {
    const item = rowToItem(alert);
    await addActive({
      id: item.id,
      userId: alert.userId,
      chatId,
      condition: item.condition,
      anchorPrice: item.anchorPrice,
      createdAt: alert.createdAt.getTime(),
      expiresAt: item.expiresAt,
    });
  }
  plog.redis(`rehydrated ${rows.length} active alert${rows.length === 1 ? "" : "s"} from Postgres`);
  return rows.length;
}

// Tick found ids in the set with no hash: reload them from PG, drop the ones no longer active.
export async function healActive(ids: string[]): Promise<void> {
  const rows = await loadActiveWithChat();
  const byId = new Map(rows.map((r) => [r.alert.id, r]));
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) {
      await removeActive(id); // not active in PG anymore — stale set member
      plog.skip(`heal: ${id.slice(0, 8)} not active in PG — removed from set`);
      continue;
    }
    const item = rowToItem(r.alert);
    await addActive({
      id,
      userId: r.alert.userId,
      chatId: r.chatId,
      condition: item.condition,
      anchorPrice: item.anchorPrice,
      createdAt: r.alert.createdAt.getTime(),
      expiresAt: item.expiresAt,
    });
    plog.redis(`heal: ${id.slice(0, 8)} hash rebuilt from PG`);
  }
}
