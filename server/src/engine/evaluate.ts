import type { Condition } from "../brain/schema";

// Pure, deterministic evaluators (ARCHITECTURE.md §7/§11). No I/O, no side effects —
// the AI never decides whether a condition fired; these functions do.

export const isExpired = (expiresAt: number, now = Date.now()): boolean => now > expiresAt;

// pct move from the creation anchor, signed (+up / −down)
export const pctFromAnchor = (anchorPrice: number, current: number): number =>
  ((current - anchorPrice) / anchorPrice) * 100;

export function evaluate(cond: Condition, anchorPrice: number, current: number): boolean {
  if (cond.kind === "absolute") {
    return cond.op === "above" ? current >= cond.value : current <= cond.value;
  }
  // pct_change — anchored at creation (§7): compare live price to the stored anchor
  const moved = pctFromAnchor(anchorPrice, current);
  return cond.dir === "up" ? moved >= cond.pct : moved <= -cond.pct;
}
