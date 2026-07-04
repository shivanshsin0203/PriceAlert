import type { NextFunction, Request, Response } from "express";
import { cachedPrice } from "../cache/price";
import { AppError } from "../lib/errors";
import { findByIdForUser, listActiveByUser } from "../models/alerts.repo";
import { serializeAlert, type Display } from "../serializers/alert.serializer";
import { createAlert, deleteAlert } from "../services/alert.service";
import { usdRate } from "../services/format";
import { alertHistory } from "../services/history.service";
import { AlertIdParam, CreateAlertBody } from "../validators/alert.validator";

// User's selected display currency + usd→ccy rate (30min-cached upstream).
// Rate fetch failure degrades to plain USD display — never blocks the request.
async function displayOf(currency: "USD" | "EUR" | "INR"): Promise<Display> {
  if (currency === "USD") return { currency, rate: 1 };
  try {
    return { currency, rate: await usdRate(currency) };
  } catch {
    return { currency: "USD", rate: 1 };
  }
}

// Express 4 doesn't catch async throws — every handler funnels errors to the central handler.
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// GET /api/alerts — active alerts + live price per unique symbol (45s cache the engine fills)
export const list = wrap(async (req, res) => {
  const rows = await listActiveByUser(req.user!.userId);
  const symbols = [...new Set(rows.map((r) => (r.condition as { symbol: string }).symbol))];
  const [display, ...pairs] = await Promise.all([
    displayOf(req.user!.currency),
    ...symbols.map(async (s) => [s, (await cachedPrice(s))?.price ?? null] as const),
  ]);
  const prices = new Map(pairs);
  res.json({
    currency: display.currency,
    alerts: rows.map((r) => serializeAlert(r, prices.get((r.condition as { symbol: string }).symbol) ?? null, display)),
  });
});

// POST /api/alerts — same validated service the Telegram bot uses (no LLM in this path)
export const create = wrap(async (req, res) => {
  const parsed = CreateAlertBody.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid alert condition", 400);
  }
  const result = await createAlert(req.user!, parsed.data.condition);
  if (!result.ok) throw new AppError(result.reason, 422); // friendly guard reason, verbatim
  const row = await findByIdForUser(result.alert.id, req.user!.userId);
  res.status(201).json({
    alert: row ? serializeAlert(row, result.current, await displayOf(req.user!.currency)) : null,
    note: result.note ?? null,
  });
});

// DELETE /api/alerts/:id — cancel (PG transition + hot-set cleanup)
export const remove = wrap(async (req, res) => {
  const p = AlertIdParam.safeParse(req.params);
  if (!p.success) throw new AppError("Invalid alert id", 400);
  const ok = await deleteAlert(req.user!.userId, p.data.id);
  if (!ok) throw new AppError("Alert not found (or already finished)", 404);
  res.json({ ok: true });
});

// GET /api/alerts/:id/history — per-minute series + the alert overlay data for the graph
export const history = wrap(async (req, res) => {
  const p = AlertIdParam.safeParse(req.params);
  if (!p.success) throw new AppError("Invalid alert id", 400);
  const row = await findByIdForUser(p.data.id, req.user!.userId);
  if (!row) throw new AppError("Alert not found", 404);

  let h;
  try {
    h = await alertHistory(row);
  } catch {
    throw new AppError("Couldn't load price history from the market source — try again in a moment", 502);
  }
  const cond = row.condition as { symbol: string };
  // terminal alerts have no live price — the last charted point stands in, so the
  // stats strip still shows the closing numbers (price at fire/expiry, moved %)
  const current =
    row.status === "active"
      ? ((await cachedPrice(cond.symbol))?.price ?? null)
      : (h.series[h.series.length - 1]?.p ?? null);
  res.json({ alert: serializeAlert(row, current, await displayOf(req.user!.currency)), history: h });
});
