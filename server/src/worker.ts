import { startBot } from "./bot/bot";
import { redis } from "./cache/redis";
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

  await startWatcher();
  plog.boot("watcher worker started ✓ (ticks every minute)");
  startDeliveryWorker();
  plog.boot("delivery worker started ✓ (retries ×5, exponential backoff)");

  await startBot();
}

main().catch((e) => {
  plog.error("worker failed to start:", e);
  process.exit(1);
});
