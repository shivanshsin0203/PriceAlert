import IORedis from "ioredis";
import { env } from "../config/env";
import { plog } from "../lib/logger";

// One shared Redis client (ARCHITECTURE.md §9). BullMQ requires maxRetriesPerRequest: null.
// An unhandled 'error' event would kill the process — the listener below IS the graceful handling:
// log (throttled), let the retryStrategy reconnect, never crash.

let lastErrorLog = 0;

// Shared throttled reporter — also attached to BullMQ's Queue/Worker error events
// (BullMQ duplicates the connection internally; without this, an outage spams stack traces).
export function reportRedisError(e: Error): void {
  if (Date.now() - lastErrorLog > 30_000) {
    lastErrorLog = Date.now();
    plog.error(`redis: ${e.message} (reconnecting — this repeats at most every 30s)`);
  }
}

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 500, 5_000), // back off up to 5s, retry forever
});

redis.on("connect", () => plog.redis("connected", env.REDIS_URL));
redis.on("error", reportRedisError);
