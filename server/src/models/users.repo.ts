import { eq } from "drizzle-orm";
import { redis } from "../cache/redis";
import { plog } from "../lib/logger";
import { db } from "./db";
import { telegramLinks, users } from "./schema";

// Telegram-first identity (no seed script — user decision): the first message from a
// chat_id auto-creates a minimal users row (email null) + its telegram_links row.
// A Redis read-through cache keeps Neon asleep during normal chatting.

export type BotUser = { userId: string; chatId: number; currency: "USD" | "EUR" | "INR" };

const CACHE_TTL_SEC = 24 * 60 * 60;
const key = (chatId: number) => `tguser:${chatId}`;

export async function findOrCreateByChatId(chatId: number, username?: string): Promise<BotUser> {
  // 1. Redis cache
  try {
    const hit = await redis.hgetall(key(chatId));
    if (hit?.userId) return { userId: hit.userId, chatId, currency: hit.currency as BotUser["currency"] };
  } catch {
    // cache miss path below works without Redis
  }

  // 2. Existing link?
  const linked = await db
    .select({ userId: telegramLinks.userId, currency: users.preferredCurrency })
    .from(telegramLinks)
    .innerJoin(users, eq(users.id, telegramLinks.userId))
    .where(eq(telegramLinks.chatId, chatId))
    .limit(1);

  let user: BotUser;
  if (linked.length > 0) {
    user = { userId: linked[0].userId, chatId, currency: linked[0].currency };
  } else {
    // 3. First contact — create user + link
    const [u] = await db.insert(users).values({}).returning({ id: users.id });
    await db.insert(telegramLinks).values({ userId: u.id, chatId, telegramUsername: username ?? null });
    user = { userId: u.id, chatId, currency: "USD" };
    plog.pg(`new telegram-first user ${u.id} for chat ${chatId}${username ? ` (@${username})` : ""}`);
  }

  redis
    .multi()
    .hset(key(chatId), { userId: user.userId, currency: user.currency })
    .expire(key(chatId), CACHE_TTL_SEC)
    .exec()
    .catch(() => {});
  return user;
}

export async function setCurrency(user: BotUser, currency: BotUser["currency"]): Promise<void> {
  await db.update(users).set({ preferredCurrency: currency, updatedAt: new Date() }).where(eq(users.id, user.userId));
  redis.hset(key(user.chatId), { currency }).catch(() => {});
}
