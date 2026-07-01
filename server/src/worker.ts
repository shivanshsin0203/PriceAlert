import { env } from "./config/env";
import { logger } from "./lib/logger";

// ENTRY: worker process (ARCHITECTURE.md §5, §11). Runs as its own PM2 app.
// Skeleton placeholder: real BullMQ repeatable "tick" (watcher) + delivery workers land next.
logger.info(`Worker process started (env=${env.NODE_ENV}). BullMQ wiring TBD — build step 1.`);

setInterval(() => {
  logger.info("tick placeholder — watcher not yet implemented (see ARCHITECTURE.md §11)");
}, 60_000);
