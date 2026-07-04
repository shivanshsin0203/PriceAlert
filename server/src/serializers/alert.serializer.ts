import type { Condition } from "../brain/schema";
import { label, nameOf } from "../adapters/symbols";
import type { AlertRow } from "../models/alerts.repo";
import { describeAlert, displayPrice, type Currency } from "../services/format";

// DTO shapes the dashboard consumes. Numbers stay numbers (the client charts them);
// the pre-formatted strings ride along so the UI needs zero money logic.
// Display rule: user's SELECTED currency with native USD in parens (see format.displayPrice);
// creation/targets always live in the asset's native quote — that's what the engine compares.

export type Display = { currency: Currency; rate: number }; // usd→currency, 1 for USD

export type AlertDTO = {
  id: string;
  status: string;
  symbol: string;
  name: string; // "Bitcoin"
  label: string; // "Bitcoin (BTC)"
  condition: Condition;
  description: string; // human one-liner (same renderer the bot uses)
  displayCurrency: Currency;
  anchorPrice: number;
  targetPrice: number; // absolute: the level; pct: anchor ± pct
  currentPrice: number | null; // live (45s cache); null = source unreachable right now
  currentPriceFmt: string | null;
  targetPriceFmt: string;
  anchorPriceFmt: string;
  // "needs +2.4% rise" — distance from CURRENT price to the target (the number that matters)
  distanceToTarget: { pct: number; dir: "up" | "down" } | null;
  // condition already satisfied — the watcher will fire on its next tick (≤60s).
  // Without this the card shows a nonsense flipped sign ("needs −0.02% drop") in the gap.
  targetReached: boolean;
  // how far the price has moved since creation, signed (drives the graph stats)
  movedFromAnchorPct: number | null;
  progressPct: number | null; // 0..100 share of the anchor→target journey covered (clamped)
  createdAt: number; // ms epoch
  expiresAt: number;
  triggeredAt: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function targetOf(cond: Condition, anchorPrice: number): number {
  return cond.kind === "absolute"
    ? cond.value
    : anchorPrice * (cond.dir === "up" ? 1 + cond.pct / 100 : 1 - cond.pct / 100);
}

export function serializeAlert(row: AlertRow, currentPrice: number | null, display: Display): AlertDTO {
  const cond = row.condition as Condition;
  const anchorPrice = Number((row.evalState as { anchorPrice?: number })?.anchorPrice ?? 0);
  const expiresAt = row.expiresAt ? row.expiresAt.getTime() : row.createdAt.getTime() + DAY_MS;
  const target = targetOf(cond, anchorPrice);
  const fmt = (v: number) => displayPrice(v, cond.symbol, display.currency, display.rate);

  let progressPct: number | null = null;
  let distanceToTarget: AlertDTO["distanceToTarget"] = null;
  let movedFromAnchorPct: number | null = null;
  let targetReached = false;
  if (currentPrice != null) {
    targetReached =
      cond.kind === "absolute"
        ? cond.op === "above"
          ? currentPrice >= cond.value
          : currentPrice <= cond.value
        : cond.dir === "up"
          ? currentPrice >= target
          : currentPrice <= target;
    if (target !== anchorPrice) {
      const p = ((currentPrice - anchorPrice) / (target - anchorPrice)) * 100;
      progressPct = Math.max(0, Math.min(100, Math.round(p * 10) / 10));
    }
    if (currentPrice > 0) {
      const gap = ((target - currentPrice) / currentPrice) * 100;
      distanceToTarget = { pct: round2(Math.abs(gap)), dir: gap >= 0 ? "up" : "down" };
    }
    if (anchorPrice > 0) movedFromAnchorPct = round2(((currentPrice - anchorPrice) / anchorPrice) * 100);
  }

  return {
    id: row.id,
    status: row.status,
    symbol: cond.symbol,
    name: nameOf(cond.symbol),
    label: label(cond.symbol),
    condition: cond,
    description: describeAlert({ condition: cond, anchorPrice, expiresAt }),
    displayCurrency: display.currency,
    anchorPrice,
    targetPrice: target,
    currentPrice,
    currentPriceFmt: currentPrice != null ? fmt(currentPrice) : null,
    targetPriceFmt: fmt(target),
    anchorPriceFmt: fmt(anchorPrice),
    distanceToTarget,
    targetReached,
    movedFromAnchorPct,
    progressPct,
    createdAt: row.createdAt.getTime(),
    expiresAt,
    triggeredAt: row.triggeredAt ? row.triggeredAt.getTime() : null,
  };
}
