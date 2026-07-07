import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Api } from "grammy";
import { redis } from "../cache/redis";
import { env } from "../config/env";
import { plog } from "../lib/logger";
import { db } from "../models/db";
import { alerts, deliveries, telegramLinks, users } from "../models/schema";
import { invalidateChatCache } from "../models/users.repo";
import { rehydrateActive } from "./alert.service";

// For the dashboard-initiated disconnect notice (runs in the API process, where the
// bot instance doesn't live — a bare Api client is all sendMessage needs).
const tg = new Api(env.TELEGRAM_BOT_TOKEN);

// "singhshivansh12may@gmail.com" → "sin…@gmail.com" — enough to recognize your own
// account in bot messages without broadcasting the full address into a chat.
export function maskEmail(email: string | null): string {
  if (!email || !email.includes("@")) return "your dashboard account";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 3)}…@${domain}`;
}

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
  | { ok: true; already: boolean; mergedAlerts: number; email: string | null }
  | { ok: false; reason: string };

export async function consumeLinkToken(token: string, chatId: number, username?: string): Promise<LinkOutcome> {
  const userId = await redis.getdel(key(token)); // one-time: gone even if the steps below fail
  if (!userId) {
    return { ok: false, reason: "that link is invalid or has expired — open the dashboard and get a fresh one." };
  }

  const outcome = await db.transaction(async (tx): Promise<LinkOutcome> => {
    const [target] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) return { ok: false, reason: "that account no longer exists — sign in again and retry." };

    const [existing] = await tx
      .select({ userId: telegramLinks.userId, email: users.email })
      .from(telegramLinks)
      .innerJoin(users, eq(users.id, telegramLinks.userId))
      .where(eq(telegramLinks.chatId, chatId))
      .limit(1);

    if (existing?.userId === userId) return { ok: true, already: true, mergedAlerts: 0, email: target.email };
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
    return { ok: true, already: false, mergedAlerts, email: target.email };
  });

  if (outcome.ok && !outcome.already) {
    await invalidateChatCache(chatId); // tguser:{chatId} pointed at the old placeholder
    // hot copies of merged/owned active alerts carry userId + chatId — rebuild them from PG
    await rehydrateActive().catch((e) => plog.warn(`link: rehydrate failed — ${(e as Error).message} (heals on next boot)`));
    plog.pg(`telegram chat ${chatId} linked to user ${userId.slice(0, 8)}${outcome.mergedAlerts ? ` (+${outcome.mergedAlerts} alerts merged)` : ""}`);
  }
  return outcome;
}

// ── unlink (user-controlled revocation; the missing half of link-once) ──
// Alerts always belong to the ACCOUNT, not the chat: unlinking only removes the
// delivery channel — actives keep firing to the in-app inbox (rehydrate nulls the
// hot copies' chatId). Re-linking later restores Telegram delivery in place.

const dropLink = async (chatId: number) => {
  await db.delete(telegramLinks).where(eq(telegramLinks.chatId, chatId));
  await invalidateChatCache(chatId); // tguser:{chatId} must stop resolving to the account
  await rehydrateActive().catch((e) => plog.warn(`unlink: rehydrate failed — ${(e as Error).message} (heals on next boot)`));
};

export type UnlinkOutcome = { ok: true; email: string | null } | { ok: false; reason: string };

// Bot /unlink — the chat asks to disconnect itself.
export async function unlinkByChat(chatId: number): Promise<UnlinkOutcome> {
  const [row] = await db
    .select({ userId: telegramLinks.userId, email: users.email })
    .from(telegramLinks)
    .innerJoin(users, eq(users.id, telegramLinks.userId))
    .where(eq(telegramLinks.chatId, chatId))
    .limit(1);
  if (!row) return { ok: false, reason: "this chat isn't connected to a web account — nothing to disconnect." };
  if (row.email == null) {
    // telegram-first placeholder: the "link" IS its identity — deleting it would orphan its alerts
    return { ok: false, reason: "this chat is a bot-only account (no web sign-in attached), so there's nothing to disconnect." };
  }
  await dropLink(chatId);
  plog.pg(`telegram chat ${chatId} UNLINKED from user ${row.userId.slice(0, 8)} (via bot)`);
  return { ok: true, email: row.email };
}

// Dashboard "Disconnect Telegram" — the account asks to cut the chat off.
// The chat gets told (fire-and-forget): if the phone was stolen/sold, the holder
// sees delivery stop for a stated reason; if it's a hijacked link, the owner's
// dashboard action visibly kills it.
export async function unlinkByUser(userId: string): Promise<{ ok: true; wasLinked: boolean }> {
  const [row] = await db
    .select({ chatId: telegramLinks.chatId })
    .from(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
    .limit(1);
  if (!row) return { ok: true, wasLinked: false }; // idempotent — already disconnected
  await dropLink(row.chatId);
  plog.pg(`telegram chat ${row.chatId} UNLINKED from user ${userId.slice(0, 8)} (via dashboard)`);
  tg.sendMessage(
    row.chatId,
    "🔓 This chat was disconnected from its web account (done from the dashboard). Alerts now go to the web inbox only.\n\nIf this wasn't you, sign in to the dashboard and review your account. You can re-link anytime from there.",
  ).catch((e) => plog.warn(`unlink: couldn't notify chat ${row.chatId} — ${(e as Error).message}`));
  return { ok: true, wasLinked: true };
}
