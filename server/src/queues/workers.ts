import { Worker } from "bullmq";
import { redis, reportRedisError } from "../cache/redis";
import { plog } from "../lib/logger";
import { markFailed } from "../models/deliveries.repo";
import { deliverBatch, deliverOne } from "../services/notify.service";
import { runTick } from "../services/watcher.service";
import { tickQueue } from "./queues";

// Workers (ARCHITECTURE.md §11/§12). Started by worker.ts.
// A failed tick run never cancels the schedule — next minute runs regardless.

export async function startWatcher(): Promise<Worker> {
  // upsert = idempotent across restarts (no duplicate schedules pile up in Redis)
  await tickQueue.upsertJobScheduler("watcher-tick", { pattern: "* * * * *" }, { name: "tick" });
  plog.queue(`watcher schedule upserted: every minute (cron "* * * * *")`);

  const w = new Worker("tick", runTick, { connection: redis, concurrency: 1 });
  w.on("error", reportRedisError);
  w.on("failed", (_job, err) => plog.error(`tick run failed — ${err.message} (next minute runs anyway)`));
  return w;
}

type DeliverJob = { deliveryId?: string; deliveryIds?: string[]; text?: string };
const jobIds = (d: DeliverJob) => d.deliveryIds ?? (d.deliveryId ? [d.deliveryId] : []);

export function startDeliveryWorker(): Worker {
  const w = new Worker<DeliverJob>(
    "deliver",
    async (job) => {
      const att = `attempt ${job.attemptsMade + 1}/${job.opts.attempts}`;
      if (job.name === "sendBatch") {
        plog.deliver(`processing batch of ${job.data.deliveryIds?.length} expiries (${att})`);
        await deliverBatch(job.data.deliveryIds ?? [], job.data.text ?? "⌛ Alerts expired.");
        return;
      }
      plog.deliver(`processing ${job.data.deliveryId?.slice(0, 8)} (${att})`);
      await deliverOne(job.data.deliveryId as string);
    },
    { connection: redis, concurrency: 3 },
  );
  w.on("error", reportRedisError);
  w.on("failed", async (job, err) => {
    const ids = job ? jobIds(job.data) : [];
    const attempts = job?.opts.attempts ?? 1;
    if (job && job.attemptsMade >= attempts) {
      plog.error(`delivery [${ids.map((i) => i.slice(0, 8)).join(",")}] FAILED after ${attempts} attempts — ${err.message} (marked failed)`);
      await Promise.all(ids.map((i) => markFailed(i).catch(() => {})));
    } else {
      plog.warn(`delivery [${ids.map((i) => i.slice(0, 8)).join(",")}] attempt ${job?.attemptsMade} failed — ${err.message} (will retry)`);
    }
  });
  return w;
}
