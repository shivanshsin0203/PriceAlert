import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { redis } from "../cache/redis";
import { env } from "../config/env";
import { plog } from "../lib/logger";
import { db } from "../models/db";
import { alerts, deliveries, telegramLinks, users } from "../models/schema";
import { invalidateChatCache } from "../models/users.repo";
import { rehydrateActive } from "./alert.service";

// Telegram account linking (ARCHITECTURE.md §13 "Identity"): the dashboard mints a
// one-time deep-link token (Redis verify:{token} → userId, TTL 10 min); tapping Start
// in Telegram sends `/start <token>` and we bind chat_id → user. If the chat already
// belongs to a telegram-first PLACEHOLDER user (email null — auto-created by the bot
// before sign-in existed), that user's alerts + notification history are merged into
// the Google account (user decision: link + merge, one identity everywhere).

const TOKEN_TTL_SEC = 600;
const key = (token: string) => `verify:${token}`;

export async function createLinkToken(userId: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!env.TELEGRAM_BOT_USERNAME) {
    return { ok: false, reason: "Telegram linking isn't configured on the server (TELEGRAM_BOT_USERNAME missing)." };
  }
  const token = randomBytes(24).toString("base64url"); // 32 chars — within Telegram's 64-char start-payload limit
  await redis.set(key(token), userId, "EX", TOKEN_TTL_SEC);
  return { ok: true, url: `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${token}` };
}

export type LinkOutcome =
  | { ok: true; already: boolean; mergedAlerts: number }
  | { ok: false; reason: string };

export async function consumeLinkToken(token: string, chatId: number, username?: string): Promise<LinkOutcome> {
  const userId = await redis.getdel(key(token)); // one-time: gone even if the steps below fail
  if (!userId) {
    return { ok: false, reason: "that link is invalid or has expired — open the dashboard and get a fresh one." };
  }

  const outcome = await db.transaction(async (tx): Promise<LinkOutcome> => {
    const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return { ok: false, reason: "that account no longer exists — sign in again and retry." };

    const [existing] = await tx
      .select({ userId: telegramLinks.userId, email: users.email })
      .from(telegramLinks)
      .innerJoin(users, eq(users.id, telegramLinks.userId))
      .where(eq(telegramLinks.chatId, chatId))
      .limit(1);

    if (existing?.userId === userId) return { ok: true, already: true, mergedAlerts: 0 };
    if (existing && existing.email != null) {
      return { ok: false, reason: "this Telegram is already connected to a different signed-in account." };
    }

    let mergedAlerts = 0;
    if (existing) {
      // placeholder adoption: everything the telegram-first user owned moves over
      const moved = await tx.update(alerts).set({ userId }).where(eq(alerts.userId, existing.userId)).returning({ id: alerts.id });
      await tx.update(deliveries).set({ userId }).where(eq(deliveries.userId, existing.userId));
      await tx.delete(telegramLinks).where(eq(telegramLinks.chatId, chatId));
      await tx.delete(users).where(eq(users.id, existing.userId));
      mergedAlerts = moved.length;
    }

    // one link per user (PK user_id): replace any previous chat this account had
    await tx.delete(telegramLinks).where(eq(telegramLinks.userId, userId));
    await tx.insert(telegramLinks).values({ userId, chatId, telegramUsername: username ?? null });
    return { ok: true, already: false, mergedAlerts };
  });

  if (outcome.ok && !outcome.already) {
    await invalidateChatCache(chatId); // tguser:{chatId} pointed at the old placeholder
    // hot copies of merged/owned active alerts carry userId + chatId — rebuild them from PG
    await rehydrateActive().catch((e) => plog.warn(`link: rehydrate failed — ${(e as Error).message} (heals on next boot)`));
    plog.pg(`telegram chat ${chatId} linked to user ${userId.slice(0, 8)}${outcome.mergedAlerts ? ` (+${outcome.mergedAlerts} alerts merged)` : ""}`);
  }
  return outcome;
}
