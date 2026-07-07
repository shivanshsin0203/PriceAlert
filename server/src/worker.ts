import type { Bot } from "grammy";
import { startBot } from "./bot/bot";
import { redis } from "./cache/redis";
import { env } from "./config/env";
import { plog } from "./lib/logger";
import { startDeliveryWorker, startWatcher } from "./queues/workers";
import { rehydrateActive } from "./services/alert.service";

// ENTRY: worker process (ARCHITECTURE.md §5) — Telegram bot + watcher tick + delivery worker.
// Boot order: Redis → rehydrate (PG → hot set) → queues → bot. Every step logs its state.

process.on("unhandledRejection", (e) =>
  plog.error("unhandled rejection:", e instanceof Error ? e.message : e),
);

let wasDisconnected = false;

async function main() {
  plog.boot("worker starting — bot + watcher + delivery");

  try {
    await redis.ping();
    plog.boot("redis reachable ✓");
  } catch {
    plog.error("redis not reachable at boot — will keep retrying in the background (is the container up?)");
  }

  // Postgres → Redis: the hot set is derived state, rebuilt at every boot (§9)
  try {
    await rehydrateActive();
  } catch (e) {
    plog.error(`rehydrate failed — ${(e as Error).message} (watcher runs with whatever is in Redis)`);
  }

  // After a Redis outage heals, rebuild the hot set (creates during the outage never reached Redis)
  redis.on("close", () => (wasDisconnected = true));
  redis.on("ready", () => {
    if (!wasDisconnected) return;
    wasDisconnected = false;
    plog.redis("reconnected — rehydrating active set from Postgres");
    rehydrateActive().catch((e) => plog.error(`post-reconnect rehydrate failed — ${(e as Error).message}`));
  });

  const watcher = await startWatcher();
  plog.boot("watcher worker started ✓ (ticks every minute)");
  const deliverer = startDeliveryWorker();
  plog.boot("delivery worker started ✓ (retries ×5, exponential backoff)");

  // Transport per §19: polling only in local dev. webhook = the API process hosts /bot;
  // off = local default after deploy (polling here would delete the production webhook).
  let bot: Bot | undefined;
  if (env.TELEGRAM_MODE === "polling") {
    bot = await startBot();
  } else {
    plog.bot(`TELEGRAM_MODE=${env.TELEGRAM_MODE} — no polling in the worker (delivery still works)`);
  }

  // Graceful shutdown (docker stop / PM2 reload send SIGTERM): finish in-flight jobs,
  // stop pulling new ones, then exit. Hard 10s cap so a stuck close can't hang the stop.
  let stopping = false;
  const shutdown = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    plog.boot(`${sig} — shutting down (waiting for in-flight jobs)…`);
    setTimeout(() => process.exit(1), 10_000).unref();
    await Promise.allSettled([bot?.stop(), watcher.close(), deliverer.close()]);
    await redis.quit().catch(() => {});
    plog.boot("worker stopped cleanly ✓");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e) => {
  plog.error("worker failed to start:", e);
  process.exit(1);
});
