import { eq } from "drizzle-orm";
import { redis } from "../cache/redis";
import { plog } from "../lib/logger";
import { db } from "./db";
import { telegramLinks, users } from "./schema";

// Identity (ARCHITECTURE.md §6): Google account = the durable identity; Telegram-first
// users (email null, auto-created on first bot message) are placeholders that get merged
// into the Google user at deep-link time. A Redis read-through cache keeps Neon asleep
// during normal chatting.

// chatId is null for Google users who haven't linked Telegram yet.
export type BotUser = { userId: string; chatId: number | null; currency: "USD" | "EUR" | "INR" };

export type AuthedUser = BotUser & {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  telegramUsername: string | null;
};

export type UserRow = typeof users.$inferSelect;

// JWT → full user, one query (left join: telegram link is optional).
export async function findAuthUser(userId: string): Promise<AuthedUser | null> {
  const rows = await db
    .select({ u: users, chatId: telegramLinks.chatId, tgUsername: telegramLinks.telegramUsername })
    .from(users)
    .leftJoin(telegramLinks, eq(telegramLinks.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (rows.length === 0) return null;
  const { u, chatId, tgUsername } = rows[0];
  return {
    userId: u.id,
    chatId,
    currency: u.preferredCurrency,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    telegramUsername: tgUsername,
  };
}

export type GoogleProfile = { sub: string; email: string; name?: string | null; avatarUrl?: string | null };

// Google sign-in upsert (§6 step 4): google_sub is the anchor; email is the secondary
// match (covers a future "same person, sub row lost" import) — else a fresh row.
export async function upsertGoogleUser(p: GoogleProfile): Promise<UserRow> {
  const fresh = { name: p.name ?? null, avatarUrl: p.avatarUrl ?? null, updatedAt: new Date() };

  const [bySub] = await db
    .update(users)
    .set({ email: p.email, ...fresh })
    .where(eq(users.googleSub, p.sub))
    .returning();
  if (bySub) return bySub;

  const [byEmail] = await db
    .update(users)
    .set({ googleSub: p.sub, ...fresh })
    .where(eq(users.email, p.email))
    .returning();
  if (byEmail) return byEmail;

  const [created] = await db
    .insert(users)
    .values({ googleSub: p.sub, email: p.email, name: p.name ?? null, avatarUrl: p.avatarUrl ?? null })
    .returning();
  plog.pg(`new google user ${created.id} (${p.email})`);
  return created;
}

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
  if (user.chatId != null) redis.hset(key(user.chatId), { currency }).catch(() => {});
}

// The tguser:{chatId} cache maps a chat to a userId — must be dropped when the chat is
// re-pointed to a different user (deep-link merge).
export async function invalidateChatCache(chatId: number): Promise<void> {
  await redis.del(key(chatId)).catch(() => {});
}
