import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { setCurrency } from "../models/users.repo";

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const Body = z.object({ currency: z.enum(["USD", "EUR", "INR"]) });

// POST /api/me/currency — same preference the Telegram bot's change_currency uses
// (users.preferred_currency + the Redis tguser cache), so both surfaces stay in sync.
export const updateCurrency = wrap(async (req, res) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) throw new AppError("currency must be USD, EUR or INR", 400);
  await setCurrency(req.user!, parsed.data.currency);
  res.json({ ok: true, currency: parsed.data.currency });
});
