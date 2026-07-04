import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { findOrCreateByChatId, type BotUser } from "../models/users.repo";

// Pre-auth identity seam (dashboard dev phase): every /api request runs as the
// DASHBOARD_CHAT_ID user — the SAME row the Telegram bot uses, so alerts made on
// either surface show up on both. When auth lands, this middleware is replaced by
// "read user off the verified JWT" and nothing downstream changes.

declare module "express-serve-static-core" {
  interface Request {
    user?: BotUser;
  }
}

// Resolved PER REQUEST (findOrCreateByChatId is Redis-cached, ~1ms) — a process-lifetime
// cache here would freeze the currency: "change my currency to inr" in Telegram must
// reflect on the dashboard by the next poll.
export async function dashboardUser(req: Request, res: Response, next: NextFunction) {
  try {
    req.user = await findOrCreateByChatId(env.DASHBOARD_CHAT_ID);
    next();
  } catch {
    res.status(503).json({ error: { message: "Could not resolve the dashboard user (database unavailable). Try again shortly." } });
  }
}
