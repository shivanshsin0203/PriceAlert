import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { dismissNotification, listInbox, markAllRead, unreadCount } from "../models/deliveries.repo";
import { serializeNotification } from "../serializers/notification.serializer";

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// GET /api/notifications — the bell dropdown (inapp rows the engine already writes)
export const list = wrap(async (req, res) => {
  const rows = await listInbox(req.user!.userId);
  res.json({ notifications: rows.map(serializeNotification), unread: rows.filter((r) => !r.read).length });
});

// GET /api/notifications/unread-count — the badge (polled alongside alerts)
export const count = wrap(async (req, res) => {
  res.json({ unread: await unreadCount(req.user!.userId) });
});

// POST /api/notifications/read-all — opening the panel clears the badge
export const readAll = wrap(async (req, res) => {
  await markAllRead(req.user!.userId);
  res.json({ ok: true });
});

// DELETE /api/notifications/:id — soft delete (audit row survives, bell forgets it)
export const dismiss = wrap(async (req, res) => {
  const id = req.params.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("Invalid notification id", 400);
  const ok = await dismissNotification(id, req.user!.userId);
  if (!ok) throw new AppError("Notification not found", 404);
  res.json({ ok: true });
});
