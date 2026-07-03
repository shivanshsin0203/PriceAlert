import { redis } from "./redis";

// Rolling conversation window in Redis: last 7 messages per chat, 1h TTL (user decision).
// Replaces the old in-memory Map — survives restarts, expires on its own.

export type Turn = { role: "user" | "assistant"; content: string };

const KEEP = 7;
const TTL_SEC = 60 * 60;
const key = (chatId: number) => `chat:${chatId}`;

export async function getHistory(chatId: number): Promise<Turn[]> {
  try {
    const raw = await redis.lrange(key(chatId), 0, -1);
    return raw.map((s) => JSON.parse(s) as Turn);
  } catch {
    return []; // no history is a graceful degradation, never an error the user sees
  }
}

export async function pushTurn(chatId: number, turn: Turn): Promise<void> {
  const k = key(chatId);
  try {
    await redis.multi().rpush(k, JSON.stringify(turn)).ltrim(k, -KEEP, -1).expire(k, TTL_SEC).exec();
  } catch {
    // losing one turn of context is fine
  }
}
