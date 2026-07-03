import { Queue } from "bullmq";
import { redis, reportRedisError } from "../cache/redis";

// Queue handles only — workers live in workers.ts (keeps service ↔ queue imports acyclic).
// tick   = the "cron": one repeatable job, every minute (ARCHITECTURE.md §11)
// deliver = must-deliver notifications with retries (§12)

export const tickQueue = new Queue("tick", { connection: redis });

export const deliverQueue = new Queue("deliver", {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2_000 }, // 2s → 4s → 8s → 16s → 32s
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

tickQueue.on("error", reportRedisError);
deliverQueue.on("error", reportRedisError);

export const enqueueDelivery = (deliveryId: string) => deliverQueue.add("send", { deliveryId });

// Several expiries for one user in one tick → ONE summary message (fires are never batched)
export const enqueueExpiryBatch = (deliveryIds: string[], text: string) =>
  deliverQueue.add("sendBatch", { deliveryIds, text });
