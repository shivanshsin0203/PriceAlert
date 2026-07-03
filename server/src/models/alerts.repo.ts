import { and, eq } from "drizzle-orm";
import type { Condition } from "../brain/schema";
import { db } from "./db";
import { alerts, telegramLinks } from "./schema";

// Data access for alerts (ARCHITECTURE.md §8). Status transitions are guarded WHERE
// status='active' so a double transition (crash replay) is a clean no-op, not a bug.

export type AlertRow = typeof alerts.$inferSelect;

export type NewAlert = {
  userId: string;
  condition: Condition;
  anchorPrice: number;
  expiresAt: Date;
  nlInput?: string;
  label?: string;
};

export async function insertAlert(a: NewAlert): Promise<AlertRow> {
  const [row] = await db
    .insert(alerts)
    .values({
      userId: a.userId,
      condition: a.condition,
      symbols: [a.condition.symbol],
      channels: ["telegram", "inapp"],
      expiresAt: a.expiresAt,
      evalState: { anchorPrice: a.anchorPrice },
      nlInput: a.nlInput,
      label: a.label,
    })
    .returning();
  return row;
}

export const listActiveByUser = (userId: string) =>
  db.select().from(alerts).where(and(eq(alerts.userId, userId), eq(alerts.status, "active"))).orderBy(alerts.createdAt);

// Terminal transitions — return the row only if WE made the transition (idempotency guard).
async function transition(id: string, status: "triggered" | "expired" | "cancelled"): Promise<AlertRow | null> {
  const [row] = await db
    .update(alerts)
    .set({ status, updatedAt: new Date(), ...(status === "triggered" ? { triggeredAt: new Date() } : {}) })
    .where(and(eq(alerts.id, id), eq(alerts.status, "active")))
    .returning();
  return row ?? null;
}

export const markTriggered = (id: string) => transition(id, "triggered");
export const markExpired = (id: string) => transition(id, "expired");

export async function cancelAlert(id: string, userId: string): Promise<boolean> {
  const [row] = await db
    .update(alerts)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId), eq(alerts.status, "active")))
    .returning({ id: alerts.id });
  return !!row;
}

// Rehydrate source: every active alert joined with its owner's chat_id (§9 rules).
export const loadActiveWithChat = () =>
  db
    .select({ alert: alerts, chatId: telegramLinks.chatId })
    .from(alerts)
    .innerJoin(telegramLinks, eq(telegramLinks.userId, alerts.userId))
    .where(eq(alerts.status, "active"));
