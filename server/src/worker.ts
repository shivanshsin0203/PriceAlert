import { startBot } from "./bot/bot";
import { logger } from "./lib/logger";

// ENTRY: worker process (ARCHITECTURE.md §5). Dev: runs the Telegram bot (long-polling).
// The watcher (BullMQ) lands here later alongside the bot.
startBot().catch((e) => {
  logger.error("failed to start bot:", e);
  process.exit(1);
});
