import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../lib/errors";
import { findAuthUser, setCurrency } from "../models/users.repo";
import { createLinkToken, unlinkByUser } from "../services/telegram-link.service";

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

// GET /api/me — profile DTO for the dashboard header + Telegram link status.
// Always re-queried (not read off the JWT): link status and currency change server-side.
export const getMe = wrap(async (req, res) => {
  const me = await findAuthUser(req.user!.userId);
  if (!me) throw new AppError("account not found", 404);
  res.json({
    email: me.email,
    name: me.name,
    avatarUrl: me.avatarUrl,
    currency: me.currency,
    telegram: { linked: me.chatId != null, username: me.telegramUsername },
  });
});

// POST /api/me/telegram/link-token — one-time deep link for Telegram binding (§13).
export const telegramLinkToken = wrap(async (req, res) => {
  const r = await createLinkToken(req.user!.userId);
  if (!r.ok) throw new AppError(r.reason, 503);
  res.json({ url: r.url });
});

// POST /api/me/telegram/unlink — revoke the binding (idempotent). The chat is notified;
// alerts keep firing to the in-app inbox.
export const telegramUnlink = wrap(async (req, res) => {
  const r = await unlinkByUser(req.user!.userId);
  res.json({ ok: true, wasLinked: r.wasLinked });
});
