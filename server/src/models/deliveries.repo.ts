import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { deliveries, telegramLinks } from "./schema";

// Deliveries = the in-app inbox AND the fire history (ARCHITECTURE.md §8).
// UNIQUE(alert_id, channel) is the one-shot double-fire guard: a duplicate insert
// (crash replay between fire steps) returns null instead of throwing (§11).

export type DeliveryRow = typeof deliveries.$inferSelect;
export type Channel = "telegram" | "inapp";

export async function insertPending(d: {
  alertId: string;
  userId: string;
  channel: Channel;
  price?: number;
  contextText: string;
  payload: Record<string, unknown>;
}): Promise<DeliveryRow | null> {
  try {
    const [row] = await db
      .insert(deliveries)
      .values({
        alertId: d.alertId,
        userId: d.userId,
        channel: d.channel,
        price: d.price != null ? String(d.price) : null,
        contextText: d.contextText,
        payload: d.payload,
      })
      .returning();
    return row;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return null; // unique violation = already fired
    throw e;
  }
}

export async function markSent(id: string): Promise<void> {
  await db.update(deliveries).set({ status: "sent", deliveredAt: new Date() }).where(eq(deliveries.id, id));
}

export async function markFailed(id: string): Promise<void> {
  await db.update(deliveries).set({ status: "failed" }).where(eq(deliveries.id, id));
}

// ── In-app inbox (the dashboard bell) — readers over rows the engine already writes ──
// The `inapp` delivery row IS the notification. Dismiss = soft delete (dismissed_at),
// so the fire/delivery audit trail stays intact.

const inboxWhere = (userId: string) =>
  and(eq(deliveries.userId, userId), eq(deliveries.channel, "inapp"), isNull(deliveries.dismissedAt));

export const listInbox = (userId: string, limit = 50) =>
  db.select().from(deliveries).where(inboxWhere(userId)).orderBy(desc(deliveries.firedAt)).limit(limit);

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(deliveries)
    .where(and(inboxWhere(userId), eq(deliveries.read, false)));
  return row?.n ?? 0;
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(deliveries)
    .set({ read: true })
    .where(and(inboxWhere(userId), eq(deliveries.read, false)));
}

export async function dismissNotification(id: string, userId: string): Promise<boolean> {
  const [row] = await db
    .update(deliveries)
    .set({ dismissedAt: new Date(), read: true })
    .where(and(eq(deliveries.id, id), eq(deliveries.userId, userId), eq(deliveries.channel, "inapp")))
    .returning({ id: deliveries.id });
  return !!row;
}

// The delivery worker loads by id, joined with the chat to send to.
export async function loadForDelivery(id: string): Promise<(DeliveryRow & { chatId: number | null }) | null> {
  const rows = await db
    .select({ d: deliveries, chatId: telegramLinks.chatId })
    .from(deliveries)
    .leftJoin(telegramLinks, eq(telegramLinks.userId, deliveries.userId))
    .where(eq(deliveries.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  return { ...rows[0].d, chatId: rows[0].chatId };
}
