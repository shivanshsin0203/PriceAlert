import { CREATE_LIMIT_WINDOW_SECONDS, CREATES_PER_HOUR, createLimitKey } from "../config/constants";
import { plog } from "../lib/logger";
import { redis } from "./redis";

// Alert-creation rate limit: fixed 1h window per user, counting successful creates only.
// FAIL-OPEN by design — if Redis is unreachable the create proceeds (the same outage
// already degrades the hot set; the limiter must never be the thing that breaks creates).

export type CreateQuota = { allowed: boolean; resetMinutes: number };

export async function checkCreateQuota(userId: string): Promise<CreateQuota> {
  try {
    const key = createLimitKey(userId);
    const [count, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
    const used = Number(count ?? 0);
    return {
      allowed: used < CREATES_PER_HOUR,
      resetMinutes: ttl > 0 ? Math.ceil(ttl / 60) : Math.ceil(CREATE_LIMIT_WINDOW_SECONDS / 60),
    };
  } catch (e) {
    plog.warn(`rate limit check failed — allowing create (${(e as Error).message})`);
    return { allowed: true, resetMinutes: 0 };
  }
}

export async function bumpCreateQuota(userId: string): Promise<void> {
  try {
    const key = createLimitKey(userId);
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, CREATE_LIMIT_WINDOW_SECONDS);
  } catch (e) {
    plog.warn(`rate limit bump failed — quota not counted (${(e as Error).message})`);
  }
}
